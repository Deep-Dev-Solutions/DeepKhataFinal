import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';
import {
  DAILY_CAP_ERROR,
  MailService,
  dailyCapPerAddress,
} from '../src/mail/mail.service';
import type { MailTransport, OutgoingMail } from '../src/mail/mail.types';
import { TEST_PASSWORD } from '../../e2e/fixtures/users';

const CAP = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFY = { name: 'Cap', url: 'http://localhost:3000/verify?token=abc' };

describe('Per-address daily email cap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mail: MailService;
  let sent: OutgoingMail[] = [];
  let failNext = false;
  const run = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const addr = (label: string) => `${label}-${run}@cap-test.local`;
  const prevCap = process.env.EMAIL_DAILY_CAP_PER_ADDRESS;

  const transport: MailTransport = {
    async send(m) {
      if (failNext) {
        failNext = false;
        throw new Error('simulated outage');
      }
      sent.push(m);
      return { providerId: `p-${sent.length}` };
    },
  };
  const sentTo = (to: string) =>
    sent.filter((m) => m.to.toLowerCase() === to.toLowerCase()).length;

  beforeAll(async () => {
    process.env.EMAIL_DAILY_CAP_PER_ADDRESS = String(CAP);
    process.env.AGENCY_NAME = 'Test Agency';
    app = await createTestApp();
    prisma = new PrismaClient();
    mail = app.get(MailService);
    mail.setTransport(transport);
  });

  beforeEach(() => {
    sent = [];
    failNext = false;
  });

  afterAll(async () => {
    mail.setTransport(null);
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: `-${run}@cap-test.local` } } });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds }, ownedBusinesses: { none: {} } },
    });
    await prisma.$disconnect();
    await closeTestApp(app);
    if (prevCap === undefined) delete process.env.EMAIL_DAILY_CAP_PER_ADDRESS;
    else process.env.EMAIL_DAILY_CAP_PER_ADDRESS = prevCap;
  });

  it('falls back to 10 for unset, 0 or invalid values', () => {
    const keep = process.env.EMAIL_DAILY_CAP_PER_ADDRESS;
    try {
      for (const v of [undefined, '', '0', '-2', 'abc']) {
        if (v === undefined) delete process.env.EMAIL_DAILY_CAP_PER_ADDRESS;
        else process.env.EMAIL_DAILY_CAP_PER_ADDRESS = v;
        expect(dailyCapPerAddress()).toBe(10);
      }
      process.env.EMAIL_DAILY_CAP_PER_ADDRESS = '4';
      expect(dailyCapPerAddress()).toBe(4);
    } finally {
      process.env.EMAIL_DAILY_CAP_PER_ADDRESS = keep;
    }
  });

  it('delivers sends 1-3, suppresses the 4th and records a FAILED marker row', async () => {
    const to = addr('basic');
    for (let i = 0; i < CAP; i++) {
      expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SENT');
    }
    expect(sentTo(to)).toBe(CAP);

    const fourth = await mail.send('verify-email', to, VERIFY);
    expect(fourth.status).toBe('SUPPRESSED');
    expect(sentTo(to)).toBe(CAP);

    const row = await prisma.emailLog.findUniqueOrThrow({ where: { id: fourth.id } });
    expect(row.status).toBe('FAILED');
    expect(row.error).toBe(DAILY_CAP_ERROR);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.sentAt).toBeNull();
  });

  it('does not affect a different address', async () => {
    const a = addr('iso-a');
    const b = addr('iso-b');
    for (let i = 0; i < CAP + 1; i++) await mail.send('verify-email', a, VERIFY);
    expect((await mail.send('verify-email', b, VERIFY)).status).toBe('SENT');
    expect(sentTo(a)).toBe(CAP);
    expect(sentTo(b)).toBe(1);
  });

  it('counts case and whitespace variants together but not plus-addressing', async () => {
    const base = addr('case');
    const [local, domain] = base.split('@');
    expect((await mail.send('verify-email', base, VERIFY)).status).toBe('SENT');
    expect((await mail.send('verify-email', base.toUpperCase(), VERIFY)).status).toBe('SENT');
    expect((await mail.send('verify-email', ` ${base} `, VERIFY)).status).toBe('SENT');
    expect((await mail.send('verify-email', `${local.toUpperCase()}@${domain}`, VERIFY)).status).toBe(
      'SUPPRESSED',
    );
    // Plus-addressing is a different recipient string and is not normalised.
    expect((await mail.send('verify-email', `${local}+x@${domain}`, VERIFY)).status).toBe('SENT');
  });

  it('only counts rows from the last 24 hours', async () => {
    const to = addr('window');
    const first = await mail.send('verify-email', to, VERIFY);
    await mail.send('verify-email', to, VERIFY);
    await mail.send('verify-email', to, VERIFY);
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SUPPRESSED');

    await prisma.emailLog.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - DAY_MS - 60_000) },
    });
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SENT');
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SUPPRESSED');
  });

  it('does not count suppressed rows and never retries them', async () => {
    const to = addr('retry-none');
    const first = await mail.send('verify-email', to, VERIFY);
    for (let i = 1; i < CAP; i++) await mail.send('verify-email', to, VERIFY);
    const blocked = await mail.send('verify-email', to, VERIFY);
    expect(blocked.status).toBe('SUPPRESSED');
    await mail.send('verify-email', to, VERIFY);
    await mail.send('verify-email', to, VERIFY);
    const suppressedRows = await prisma.emailLog.count({
      where: { to, status: 'FAILED', error: DAILY_CAP_ERROR },
    });
    expect(suppressedRows).toBe(3);

    // Suppressed rows do not extend the block: once a real row ages out, one slot frees.
    await prisma.emailLog.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - DAY_MS - 60_000) },
    });
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SENT');
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SUPPRESSED');

    // The retry cron ignores them, far into the future.
    const before = sentTo(to);
    await mail.retryDue(new Date(Date.now() + 7 * DAY_MS));
    expect(sentTo(to)).toBe(before);
    const row = await prisma.emailLog.findUniqueOrThrow({ where: { id: blocked.id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(0);
  });

  it('keeps concurrent sends for one address within the cap', async () => {
    const to = addr('race');
    const results = await Promise.all(
      Array.from({ length: 6 }, () => mail.send('verify-email', to, VERIFY)),
    );
    expect(results.filter((r) => r.status === 'SENT')).toHaveLength(CAP);
    expect(results.filter((r) => r.status === 'SUPPRESSED')).toHaveLength(6 - CAP);
    expect(sentTo(to)).toBe(CAP);
  });

  it('does not suppress the retry of an already-counted QUEUED row', async () => {
    const to = addr('queued');
    failNext = true;
    const first = await mail.send('verify-email', to, VERIFY);
    expect(first.status).toBe('QUEUED');
    // Fill the rest of the cap so the address is exactly at the limit.
    await mail.send('verify-email', to, VERIFY);
    await mail.send('verify-email', to, VERIFY);
    expect((await mail.send('verify-email', to, VERIFY)).status).toBe('SUPPRESSED');

    const due = (await prisma.emailLog.findUniqueOrThrow({ where: { id: first.id } }))
      .nextAttemptAt as Date;
    await mail.retryDue(new Date(due.getTime() + 1000));
    const row = await prisma.emailLog.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.status).toBe('SENT');
    expect(row.attempts).toBe(2);
    expect(sentTo(to)).toBe(CAP);
  });

  it('bypassCap skips the limit', async () => {
    const to = addr('bypass');
    for (let i = 0; i < CAP + 2; i++) {
      expect((await mail.send('verify-email', to, VERIFY, { bypassCap: true })).status).toBe('SENT');
    }
    expect(sentTo(to)).toBe(CAP + 2);
  });

  it('resend-verification keeps the same neutral 2xx shape while only the first N mails exist', async () => {
    const email = `flow-${run}@cap-test.local`;
    const http = () => request(app.getHttpServer());
    const reg = await http()
      .post('/auth/register')
      .send({ name: 'Cap Flow', email, phone: '03001234567', password: TEST_PASSWORD });
    expect(reg.status).toBe(201);
    createdUserIds.push(reg.body.user.id);
    const auth = { Authorization: `Bearer ${reg.body.accessToken as string}` };

    const bodies: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await http().post('/auth/resend-verification').set(auth);
      expect(res.status).toBe(201);
      bodies.push(res.body);
    }
    for (const b of bodies) expect(b).toEqual(bodies[0]);

    // Registration mail + 5 resends = 6 attempts; the register mail may land late.
    for (let i = 0; i < 40; i++) {
      if ((await prisma.emailLog.count({ where: { to: email, template: 'verify-email' } })) >= 6) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const rows = await prisma.emailLog.findMany({
      where: { to: email, template: 'verify-email' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.status === 'SENT')).toHaveLength(CAP);
    const blocked = rows.filter((r) => r.status === 'FAILED');
    expect(blocked).toHaveLength(6 - CAP);
    for (const r of blocked) expect(r.error).toBe(DAILY_CAP_ERROR);
    expect(sentTo(email)).toBe(CAP);
  });
  it('agency invoice send: 502 and unsent while the owner is capped, 201 and SENT once it is not', async () => {
    const tag = run;
    const ownerEmail = `inv-owner-${tag}@cap-test.local`;
    const owner = await prisma.user.create({
      data: { name: `Owner ${tag}`, email: ownerEmail, phone: '0300-1234567', role: 'OWNER' },
    });
    const business = await prisma.business.create({
      data: { name: `Cap ${tag}`, slug: `cap-${tag}`, ownerId: owner.id },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { businessId: business.id } });
    const http = () => request(app.getHttpServer());
    const admin = () => authHeader('superAdmin');
    try {
      const created = await http()
        .post('/agency/billing/invoices')
        .set(admin())
        .send({
          businessId: business.id,
          billingCycle: 'MONTHLY',
          lines: [{ description: 'Setup', quantity: 1, unitPrice: '100.00' }],
        });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      process.env.EMAIL_DAILY_CAP_PER_ADDRESS = '1';
      expect((await mail.send('verify-email', ownerEmail, VERIFY)).status).toBe('SENT');
      const blocked = await http().post(`/agency/billing/invoices/${id}/send`).set(admin());
      expect(blocked.status).toBe(502);
      let row = await prisma.agencyInvoice.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('DRAFT');
      expect(row.sentAt).toBeNull();
      expect(sentTo(ownerEmail)).toBe(1);

      process.env.EMAIL_DAILY_CAP_PER_ADDRESS = String(CAP);
      const ok = await http().post(`/agency/billing/invoices/${id}/send`).set(admin());
      expect(ok.status).toBe(201);
      row = await prisma.agencyInvoice.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('SENT');
      expect(row.sentAt).not.toBeNull();
      expect(sentTo(ownerEmail)).toBe(2);
    } finally {
      process.env.EMAIL_DAILY_CAP_PER_ADDRESS = String(CAP);
      await prisma.agencyInvoice.deleteMany({ where: { businessId: business.id } });
      await prisma.user.update({ where: { id: owner.id }, data: { businessId: null } });
      await prisma.business.delete({ where: { id: business.id } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });
});
