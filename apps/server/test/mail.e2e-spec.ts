import { INestApplication } from '@nestjs/common';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTestApp, closeTestApp } from './setup/app';
import { tenants, users } from './setup/auth';
import { MailService, RETRY_DELAYS_MS } from '../src/mail/mail.service';
import { SmtpTransport } from '../src/mail/transports';
import { NotificationsService } from '../src/notifications/notifications.service';
import { sendInviteEmail } from '../src/utils/mailer';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const BIZ = tenants.A.id;

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function mailpitFor(address: string): Promise<MailpitMessage[]> {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { messages: MailpitMessage[] };
  return body.messages ?? [];
}

async function mailpitText(id: string): Promise<{ Text: string; HTML: string }> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await res.json()) as { Text: string; HTML: string };
}

async function waitForMail(address: string): Promise<MailpitMessage[]> {
  for (let i = 0; i < 20; i++) {
    const found = await mailpitFor(address);
    if (found.length > 0) return found;
    await new Promise((r) => setTimeout(r, 150));
  }
  return [];
}

function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe('MailService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mail: MailService;
  let notifications: NotificationsService;
  const appName = process.env.APP_NAME || 'DeepKhata';
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const ping = await fetch(`${MAILPIT}/api/v1/messages?limit=1`).catch(() => null);
    expect(ping?.ok, 'Mailpit must be reachable on 127.0.0.1:8025').toBe(true);

    app = await createTestApp();
    prisma = new PrismaClient();
    mail = app.get(MailService);
    notifications = app.get(NotificationsService);
    mail.setTransport(null);
  });

  afterAll(async () => {
    mail.setTransport(null);
    await prisma.notificationSetting.deleteMany({ where: { businessId: BIZ } });
    await prisma.notification.deleteMany({ where: { businessId: BIZ } });
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('renders a branded template, sends it through SMTP and logs it as SENT', async () => {
    const to = `verify-${run}@mail-test.local`;
    const result = await mail.send(
      'verify-email',
      to,
      { name: 'Ahmed', url: 'http://localhost:3000/verify?token=abc' },
      { businessId: BIZ },
    );
    expect(result.status).toBe('SENT');

    const log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('SENT');
    expect(log.attempts).toBe(1);
    expect(log.template).toBe('verify-email');
    expect(log.businessId).toBe(BIZ);
    expect(log.sentAt).not.toBeNull();
    expect(log.providerId).toBeTruthy();

    const found = await waitForMail(to);
    expect(found).toHaveLength(1);
    expect(found[0].Subject).toContain(appName);
    const full = await mailpitText(found[0].ID);
    expect(full.Text).toContain('http://localhost:3000/verify?token=abc');
    expect(full.HTML).toContain(appName);
    expect(full.HTML + full.Text).not.toMatch(/bizflow/i);
  });

  it('escapes user-supplied values in HTML', async () => {
    const to = `escape-${run}@mail-test.local`;
    const result = await mail.send('welcome', to, {
      name: '<script>alert(1)</script>',
      businessName: 'Khan & Sons',
      links: [{ label: 'Dues', url: 'http://localhost:3000/dues' }],
    });
    expect(result.status).toBe('SENT');
    const [msg] = await waitForMail(to);
    const full = await mailpitText(msg.ID);
    expect(full.HTML).not.toContain('<script>alert(1)</script>');
    expect(full.HTML).toContain('&lt;script&gt;');
  });

  it('queues a failed send, backs off 1/5/30 minutes and ends FAILED after 3 retries', async () => {
    const port = await closedPort();
    mail.setTransport(
      new SmtpTransport({ host: '127.0.0.1', port, secure: false, connectionTimeoutMs: 2000 }),
    );
    const to = `retry-${run}@mail-test.local`;
    const t0 = new Date();
    const result = await mail.send('password-reset', to, {
      name: 'Bilal',
      url: 'http://localhost:3000/reset?token=xyz',
    });
    expect(result.status).toBe('QUEUED');

    let log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('QUEUED');
    expect(log.attempts).toBe(1);
    expect(log.error).toBeTruthy();
    expect(log.nextAttemptAt).not.toBeNull();
    const firstDue = log.nextAttemptAt as Date;
    expect(Math.abs(firstDue.getTime() - (t0.getTime() + RETRY_DELAYS_MS[0]))).toBeLessThan(10_000);

    // Not due yet: nothing is retried.
    await mail.retryDue(new Date(firstDue.getTime() - 1000));
    log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.attempts).toBe(1);

    // Retry 1 (clock at +1 min) -> next in 5 min.
    const c1 = new Date(firstDue.getTime() + 1000);
    await mail.retryDue(c1);
    log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('QUEUED');
    expect(log.attempts).toBe(2);
    expect(log.nextAttemptAt?.getTime()).toBe(c1.getTime() + RETRY_DELAYS_MS[1]);

    // Retry 2 -> next in 30 min.
    const c2 = new Date((log.nextAttemptAt as Date).getTime() + 1000);
    await mail.retryDue(c2);
    log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('QUEUED');
    expect(log.attempts).toBe(3);
    expect(log.nextAttemptAt?.getTime()).toBe(c2.getTime() + RETRY_DELAYS_MS[2]);

    // Retry 3 fails -> FAILED, never retried again.
    const c3 = new Date((log.nextAttemptAt as Date).getTime() + 1000);
    await mail.retryDue(c3);
    log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('FAILED');
    expect(log.attempts).toBe(4);
    expect(log.nextAttemptAt).toBeNull();
    expect(log.error).toBeTruthy();

    const attemptedAfter = await mail.retryDue(new Date(c3.getTime() + 24 * 3600 * 1000));
    expect(attemptedAfter).toBe(0);
    expect(await mailpitFor(to)).toHaveLength(0);
  });

  it('delivers a queued email once the transport recovers', async () => {
    const port = await closedPort();
    mail.setTransport(
      new SmtpTransport({ host: '127.0.0.1', port, secure: false, connectionTimeoutMs: 2000 }),
    );
    const to = `recover-${run}@mail-test.local`;
    const result = await mail.send('trial-tips', to, { name: 'Sana' });
    expect(result.status).toBe('QUEUED');

    mail.setTransport(null);
    const due = (await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } }))
      .nextAttemptAt as Date;
    await mail.retryDue(new Date(due.getTime() + 1000));

    const log = await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } });
    expect(log.status).toBe('SENT');
    expect(log.attempts).toBe(2);
    expect(log.error).toBeNull();
    expect(await waitForMail(to)).toHaveLength(1);
  });

  it('does not double-send a row that another worker already claimed', async () => {
    const port = await closedPort();
    mail.setTransport(
      new SmtpTransport({ host: '127.0.0.1', port, secure: false, connectionTimeoutMs: 2000 }),
    );
    const to = `claim-${run}@mail-test.local`;
    const result = await mail.send('trial-reminder', to, { name: 'Omar' });
    mail.setTransport(null);
    const due = (await prisma.emailLog.findUniqueOrThrow({ where: { id: result.id } }))
      .nextAttemptAt as Date;
    const now = new Date(due.getTime() + 1000);
    const [a, b] = await Promise.all([mail.retryDue(now), mail.retryDue(now)]);
    expect(a + b).toBe(1);
    expect(await waitForMail(to)).toHaveLength(1);
  });

  it('sendInviteEmail delegates to the mail service', async () => {
    const to = `invite-${run}@mail-test.local`;
    await sendInviteEmail(to, 'MANAGER', 'tok123', {
      inviterName: 'Ahmed Khan',
      businessName: 'Khan Traders',
      businessId: BIZ,
    });
    const [msg] = await waitForMail(to);
    expect(msg).toBeDefined();
    const full = await mailpitText(msg.ID);
    expect(full.Text).toContain('/join?token=tok123');
    expect(full.Text).toContain('Khan Traders');
    const log = await prisma.emailLog.findFirstOrThrow({ where: { to } });
    expect(log.template).toBe('staff-invite');
    expect(log.status).toBe('SENT');
  });

  it('emails a user when a notification rule includes the EMAIL channel', async () => {
    const owner = users.ownerA;
    await prisma.notificationSetting.deleteMany({ where: { businessId: BIZ } });
    await prisma.notificationSetting.create({
      data: {
        businessId: BIZ,
        userId: null,
        rules: { 'receivable.overdue': { enabled: true, channels: ['IN_APP', 'EMAIL'] } },
      },
    });
    const title = `Overdue ${run}`;
    const created = await notifications.notify({
      businessId: BIZ,
      userId: owner.id,
      type: 'receivable.overdue',
      title,
      body: 'Ali ne Rs 5,000 dena hai',
      link: '/dues',
    });
    expect(created).toBe(1);

    const found = (await waitForMail(owner.email)).filter((m) => m.Subject === title);
    expect(found).toHaveLength(1);
    const full = await mailpitText(found[0].ID);
    expect(full.Text).toContain('Ali ne Rs 5,000 dena hai');
    const log = await prisma.emailLog.findFirstOrThrow({
      where: { to: owner.email, template: 'notification', subject: title },
    });
    expect(log.status).toBe('SENT');
    expect(log.businessId).toBe(BIZ);
  });

  it('does not email when the rule has no EMAIL channel', async () => {
    const owner = users.ownerA;
    await prisma.notificationSetting.deleteMany({ where: { businessId: BIZ } });
    await prisma.notificationSetting.create({
      data: {
        businessId: BIZ,
        userId: null,
        rules: { 'receivable.overdue': { enabled: true, channels: ['IN_APP'] } },
      },
    });
    const title = `InAppOnly ${run}`;
    await notifications.notify({
      businessId: BIZ,
      userId: owner.id,
      type: 'receivable.overdue',
      title,
      body: 'x',
    });
    expect(await prisma.emailLog.count({ where: { subject: title } })).toBe(0);
  });

  it('builds the digest email with open dues for digest-type notifications', async () => {
    const owner = users.ownerA;
    await prisma.notificationSetting.deleteMany({ where: { businessId: BIZ } });
    await prisma.notificationSetting.create({
      data: {
        businessId: BIZ,
        userId: null,
        rules: { 'digest.daily': { enabled: true, channels: ['IN_APP', 'EMAIL'] } },
      },
    });
    const title = `Aaj ka khulasa ${run}`;
    await notifications.notify({
      businessId: BIZ,
      userId: owner.id,
      type: 'digest.daily',
      title,
      body: 'summary',
      link: '/dues',
    });
    const log = await prisma.emailLog.findFirstOrThrow({
      where: { to: owner.email, template: 'digest' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.status).toBe('SENT');
    expect(log.businessId).toBe(BIZ);
  });
});
