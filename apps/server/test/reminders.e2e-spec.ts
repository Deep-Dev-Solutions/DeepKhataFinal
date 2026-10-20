import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';
import { RemindersService } from '../src/reminders/reminders.service';

const { khataOther, creditOrder } = catalog;
const DAY = 24 * 60 * 60 * 1000;
const BIZ = tenants.A.id;

/** Karachi calendar date (YYYY-MM-DD) of an instant. Karachi is a fixed UTC+5. */
function karachiDate(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The instant at `hh:mm` Karachi time, `plusDays` after the Karachi date of `base`. */
function karachiAt(base: Date, plusDays: number, hhmm = '11:00'): Date {
  return new Date(
    new Date(`${karachiDate(base)}T${hhmm}:00+05:00`).getTime() + plusDays * DAY,
  );
}

describe('Reminders and notification settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let reminders: RemindersService;
  let khataDue: Date;
  let orderDue: Date;
  let recipientCount: number;

  const http = () => request(app.getHttpServer());

  async function resetState() {
    const entityIds = [khataOther.entryId, creditOrder.orderId];
    await prisma.notificationSetting.deleteMany({ where: { businessId: BIZ } });
    await prisma.promiseToPay.deleteMany({ where: { businessId: BIZ, entityId: { in: entityIds } } });
    await prisma.notificationLog.deleteMany({ where: { businessId: BIZ } });
    await prisma.notification.deleteMany({ where: { businessId: BIZ } });
  }

  const notificationsFor = (entityId: string, type = 'receivable.overdue') =>
    prisma.notification.count({ where: { businessId: BIZ, entityId, type } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    reminders = app.get(RemindersService);
    await resetState();
    khataDue = (await prisma.khataEntry.findUniqueOrThrow({ where: { id: khataOther.entryId } })).dueDate;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: creditOrder.orderId } });
    expect(order.dueDate).not.toBeNull();
    orderDue = order.dueDate as Date;
    recipientCount = await prisma.user.count({
      where: { businessId: BIZ, role: { in: ['OWNER', 'MANAGER'] } },
    });
    expect(recipientCount).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    await resetState();
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('fires receivable.overdue for the khata entry 3 days after due, once per recipient, with a useful body', async () => {
    const now = karachiAt(khataDue, 3);
    const fired = await reminders.runForBusiness(BIZ, now);
    expect(fired).toBeGreaterThanOrEqual(1);

    const rows = await prisma.notification.findMany({
      where: { businessId: BIZ, entityId: khataOther.entryId, type: 'receivable.overdue' },
    });
    expect(rows).toHaveLength(recipientCount);
    expect(rows.every((r) => r.body.includes('Malik Mobile') && r.body.includes('5,000') && r.body.includes('3 din overdue'))).toBe(true);
    expect(rows.every((r) => r.entityType === 'KHATA_ENTRY' && r.readAt === null)).toBe(true);
    const log = await prisma.notificationLog.count({
      where: { businessId: BIZ, ruleKey: 'receivable.overdue', entityId: khataOther.entryId },
    });
    expect(log).toBe(1);
  });

  it('is idempotent: re-running at the same instant and later the same Karachi day fires nothing new', async () => {
    const now = karachiAt(khataDue, 3);
    const before = await prisma.notification.count({ where: { businessId: BIZ } });
    const beforeEntity = await notificationsFor(khataOther.entryId);

    expect(await reminders.runForBusiness(BIZ, now)).toBe(0);
    expect(await reminders.runForBusiness(BIZ, karachiAt(khataDue, 3, '18:30'))).toBe(0);

    expect(await notificationsFor(khataOther.entryId)).toBe(beforeEntity);
    expect(await prisma.notification.count({ where: { businessId: BIZ } })).toBe(before);
  });

  it('fires again on the next offset day (7) because the dedupe key includes the date', async () => {
    const before = await notificationsFor(khataOther.entryId);
    await reminders.runForBusiness(BIZ, karachiAt(khataDue, 7));
    expect(await notificationsFor(khataOther.entryId)).toBe(before + recipientCount);
  });

  it('does not fire on a non-offset day (5 days overdue)', async () => {
    const before = await notificationsFor(khataOther.entryId);
    await reminders.runForBusiness(BIZ, karachiAt(khataDue, 5));
    expect(await notificationsFor(khataOther.entryId)).toBe(before);
  });

  it('control: the credit order fires receivable.overdue at 14 days overdue when it has no promise', async () => {
    expect(await notificationsFor(creditOrder.orderId)).toBe(0);
    await reminders.runForBusiness(BIZ, karachiAt(orderDue, 14));
    expect(await notificationsFor(creditOrder.orderId)).toBe(recipientCount);
  });

  it('a promise moves the reminder schedule: no overdue at due+3, fires 3 days after the promised date', async () => {
    // Clear the control run so we measure only the promised schedule.
    await prisma.notification.deleteMany({ where: { businessId: BIZ, entityId: creditOrder.orderId } });
    await prisma.notificationLog.deleteMany({ where: { businessId: BIZ, entityId: creditOrder.orderId } });

    const promised = karachiAt(orderDue, 10, '12:00');
    await http()
      .post(`/dues/ORDER/${creditOrder.orderId}/promise`)
      .set(authHeader('ownerA'))
      .send({ promisedDate: promised.toISOString() })
      .expect(201);

    await reminders.runForBusiness(BIZ, karachiAt(orderDue, 3));
    expect(await notificationsFor(creditOrder.orderId)).toBe(0);
    expect(
      await prisma.notificationLog.count({ where: { businessId: BIZ, entityId: creditOrder.orderId, ruleKey: 'receivable.overdue' } }),
    ).toBe(0);

    // Without the promise, due+14 would fire (control above) and due+13 would not;
    // with the promise, due+13 is exactly 3 days past the promised date.
    await reminders.runForBusiness(BIZ, karachiAt(orderDue, 13));
    expect(await notificationsFor(creditOrder.orderId)).toBe(recipientCount);
  });

  describe('notification settings', () => {
    it('forbids STAFF from changing settings and leaves them unchanged', async () => {
      await http()
        .put('/notification-settings')
        .set(authHeader('staffA'))
        .send({ rules: { 'receivable.overdue': { enabled: false } } })
        .expect(403);
      const res = await http().get('/notification-settings').set(authHeader('ownerA')).expect(200);
      expect(res.body.rules['receivable.overdue'].enabled).toBe(true);
      expect(res.body.rules['receivable.overdue'].offsetsDays).toEqual([3, 7, 14, 30]);
    });

    it('rejects an unknown rule key and a malformed digest time', async () => {
      await http()
        .put('/notification-settings')
        .set(authHeader('ownerA'))
        .send({ rules: { 'bogus.rule': { enabled: false } } })
        .expect(400);
      await http()
        .put('/notification-settings')
        .set(authHeader('ownerA'))
        .send({ digestTime: '25:99' })
        .expect(400);
    });

    it('disabling receivable.overdue stops overdue notifications on an offset day, and re-enabling restores them', async () => {
      const res = await http()
        .put('/notification-settings')
        .set(authHeader('ownerA'))
        .send({ rules: { 'receivable.overdue': { enabled: false } } })
        .expect(200);
      expect(res.body.rules['receivable.overdue'].enabled).toBe(false);

      const day30 = karachiAt(khataDue, 30);
      const beforeAll = await prisma.notification.count({ where: { businessId: BIZ, type: 'receivable.overdue' } });
      await reminders.runForBusiness(BIZ, day30);
      expect(await prisma.notification.count({ where: { businessId: BIZ, type: 'receivable.overdue' } })).toBe(beforeAll);
      expect(
        await prisma.notificationLog.count({ where: { businessId: BIZ, ruleKey: 'receivable.overdue', fireDate: new Date(`${karachiDate(day30)}T00:00:00.000Z`) } }),
      ).toBe(0);

      await http()
        .put('/notification-settings')
        .set(authHeader('managerA'))
        .send({ rules: { 'receivable.overdue': { enabled: true } } })
        .expect(200);
      const before = await notificationsFor(khataOther.entryId);
      await reminders.runForBusiness(BIZ, day30);
      expect(await notificationsFor(khataOther.entryId)).toBe(before + recipientCount);
    });

    it('recipients OWNER_ONLY limits fan-out to the owner', async () => {
      await http()
        .put('/notification-settings')
        .set(authHeader('ownerA'))
        .send({ recipients: 'OWNER_ONLY' })
        .expect(200);
      await prisma.notification.deleteMany({ where: { businessId: BIZ, entityId: creditOrder.orderId } });
      await prisma.notificationLog.deleteMany({ where: { businessId: BIZ, entityId: creditOrder.orderId } });
      // Promise is orderDue+10, so +10+7 = 17 days after due is the 7-day offset.
      await reminders.runForBusiness(BIZ, karachiAt(orderDue, 17));
      const rows = await prisma.notification.findMany({
        where: { businessId: BIZ, entityId: creditOrder.orderId, type: 'receivable.overdue' },
        include: { user: { select: { role: true } } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].user.role).toBe('OWNER');
      await http()
        .put('/notification-settings')
        .set(authHeader('ownerA'))
        .send({ recipients: 'OWNER_AND_MANAGERS' })
        .expect(200);
    });
  });

  describe('notifications inbox', () => {
    it('manager sees the fired rows, marks all read, and unreadCount drops to 0', async () => {
      const list = await http().get('/notifications?limit=100').set(authHeader('managerA')).expect(200);
      const items = list.body.items as { id: string; type: string; entityId: string | null; readAt: string | null }[];
      expect(items.some((i) => i.type === 'receivable.overdue' && i.entityId === khataOther.entryId)).toBe(true);
      expect(list.body.unreadCount).toBeGreaterThan(0);

      const read = await http().post('/notifications/read').set(authHeader('managerA')).send({ all: true }).expect(201);
      expect(read.body.updated).toBe(list.body.unreadCount);

      const after = await http().get('/notifications?limit=100').set(authHeader('managerA')).expect(200);
      expect(after.body.unreadCount).toBe(0);
      expect((after.body.items as { readAt: string | null }[]).every((i) => i.readAt !== null)).toBe(true);
    });

    it('marking read for one user does not touch the owner rows', async () => {
      const ownerUnread = await http().get('/notifications').set(authHeader('ownerA')).expect(200);
      expect(ownerUnread.body.unreadCount).toBeGreaterThan(0);
    });

    it('tenant B cannot mark tenant A notifications read and does not see them', async () => {
      const ownerRow = await prisma.notification.findFirstOrThrow({
        where: { businessId: BIZ, userId: '00000000-0000-4000-8000-000000000002', readAt: null },
      });
      const res = await http()
        .post('/notifications/read')
        .set(authHeader('ownerB'))
        .send({ ids: [ownerRow.id] })
        .expect(201);
      expect(res.body).toEqual({ updated: 0 });
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: ownerRow.id } })).readAt).toBeNull();

      const listB = await http().get('/notifications?limit=100').set(authHeader('ownerB')).expect(200);
      expect((listB.body.items as { id: string }[]).some((i) => i.id === ownerRow.id)).toBe(false);

      const bAll = await http().post('/notifications/read').set(authHeader('ownerB')).send({ all: true }).expect(201);
      expect(bAll.body.updated).toBeGreaterThanOrEqual(0);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: ownerRow.id } })).readAt).toBeNull();
    });

    it('marking an empty id list reads nothing', async () => {
      const res = await http().post('/notifications/read').set(authHeader('ownerA')).send({ ids: [] }).expect(201);
      expect(res.body).toEqual({ updated: 0 });
    });
  });
});
