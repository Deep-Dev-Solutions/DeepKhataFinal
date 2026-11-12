import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const HALL = tenants.A.branches.hallRoad.id;
const BIZ = tenants.A.id;

const karachiToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
    new Date(),
  );

describe('Cash expenses by day and voiding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const today = karachiToday();

  let riderExpenseId = '';
  let riderAmount = 0;

  const closeHallIfOpen = async () => {
    const status = await http()
      .get('/cash/register/status')
      .set(authHeader('ownerA', HALL));
    if (status.body?.isOpen) {
      await http()
        .post('/cash/register/close')
        .set(authHeader('ownerA', HALL))
        .send({ actualCash: '0', notes: 'E2E cleanup close' });
    }
  };

  const logExpense = (amount: string, category: string, description: string) =>
    http()
      .post('/cash/expense')
      .set(authHeader('ownerA', HALL))
      .send({ amount, category, description });

  const daily = (from = today, to = today) =>
    http()
      .get(`/cash/expenses/daily?from=${from}&to=${to}`)
      .set(authHeader('ownerA', HALL));

  // Other spec files leave vouchers in this branch on the same day, so the
  // assertions work from a snapshot and check what this file added.
  const snapshot = async () => {
    const res = await daily().expect(200);
    const day = (res.body.days as Array<any>).find((d) => d.date === today);
    const byCategory = new Map<string, { total: number; count: number }>(
      ((day?.byCategory ?? []) as Array<any>).map((c) => [
        c.category as string,
        { total: Number(c.total), count: Number(c.count) },
      ]),
    );
    return {
      dayTotal: Number(day?.total ?? 0),
      dayCount: Number(day?.count ?? 0),
      total: Number(res.body.total),
      count: Number(res.body.count),
      ids: new Set<string>(
        ((day?.expenses ?? []) as Array<any>).map((e) => e.id as string),
      ),
      byCategory,
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    await closeHallIfOpen();
    await http()
      .post('/cash/register/open')
      .set(authHeader('ownerA', HALL))
      .send({ openingBalance: 5000 })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('totals the day by category and lists the vouchers', async () => {
    const before = await snapshot();

    const chai = await logExpense('300', 'CHAI_REFRESHMENT', 'Chai for the counter').expect(201);
    const rider = await logExpense('1200.50', 'DELIVERY_RIDER', 'Rider to Liberty').expect(201);
    riderExpenseId = rider.body.expense.id;
    riderAmount = 1200.5;

    const res = await daily().expect(200);
    const day = (res.body.days as Array<any>).find((d) => d.date === today);
    expect(day).toBeTruthy();
    expect(Number(day.total)).toBe(before.dayTotal + 1500.5);
    expect(day.count).toBe(before.dayCount + 2);

    const byCategory = new Map<string, { total: number; count: number }>(
      (day.byCategory as Array<any>).map((c) => [
        c.category as string,
        { total: Number(c.total), count: Number(c.count) },
      ]),
    );
    const riderCat = byCategory.get('DELIVERY_RIDER')!;
    expect(riderCat.total).toBe(
      (before.byCategory.get('DELIVERY_RIDER')?.total ?? 0) + 1200.5,
    );
    expect(riderCat.count).toBe(
      (before.byCategory.get('DELIVERY_RIDER')?.count ?? 0) + 1,
    );
    const chaiCat = byCategory.get('CHAI_REFRESHMENT')!;
    expect(chaiCat.total).toBe(
      (before.byCategory.get('CHAI_REFRESHMENT')?.total ?? 0) + 300,
    );
    expect(chaiCat.count).toBe(
      (before.byCategory.get('CHAI_REFRESHMENT')?.count ?? 0) + 1,
    );

    expect(day.sessions.some((s: any) => s.closedAt === null)).toBe(true);
    const listed = (day.expenses as Array<any>).map((e) => e.id);
    expect(listed).toEqual(
      expect.arrayContaining([chai.body.expense.id, rider.body.expense.id]),
    );
    expect(before.ids.has(chai.body.expense.id)).toBe(false);
    expect(before.ids.has(rider.body.expense.id)).toBe(false);
    expect(Number(res.body.total)).toBe(before.total + 1500.5);
    expect(res.body.count).toBe(before.count + 2);
  });

  it('voids a voucher with a reversal: the total drops and the row stays visible', async () => {
    const before = await snapshot();
    expect(before.ids.has(riderExpenseId)).toBe(true);

    const txBefore = await prisma.expense.findUniqueOrThrow({
      where: { id: riderExpenseId },
    });

    const voided = await http()
      .post(`/cash/expenses/${riderExpenseId}/void`)
      .set(authHeader('ownerA', HALL))
      .send({ reason: 'Wrong amount, chai was Rs 100' })
      .expect(201);
    expect(voided.body.success).toBe(true);

    const afterRes = await daily().expect(200);
    const afterDay = (afterRes.body.days as Array<any>).find(
      (d) => d.date === today,
    );
    expect(Number(afterDay.total)).toBe(before.dayTotal - riderAmount);
    expect(afterDay.count).toBe(before.dayCount - 1);
    expect(Number(afterRes.body.total)).toBe(before.total - riderAmount);
    expect(afterRes.body.count).toBe(before.count - 1);
    const row = (afterDay.expenses as Array<any>).find(
      (e) => e.id === riderExpenseId,
    );
    expect(row?.isVoided).toBe(true);
    expect(row?.voidReason).toBe('Wrong amount, chai was Rs 100');

    const reversal = await prisma.transaction.findUniqueOrThrow({
      where: { id: voided.body.transactionId },
    });
    expect(reversal.type).toBe('EXPENSE_REVERSAL');
    expect(reversal.reversesId).toBe(txBefore.transactionId);
    await expectBalanced(prisma, [voided.body.transactionId]);

    // Voiding twice is refused, the original never changes.
    await http()
      .post(`/cash/expenses/${riderExpenseId}/void`)
      .set(authHeader('ownerA', HALL))
      .send({ reason: 'again' })
      .expect(409);

    // A voided voucher is out of the live drawer numbers too.
    const status = await http()
      .get('/cash/register/status')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    const liveTotal = await prisma.expense.aggregate({
      where: {
        businessId: BIZ,
        branchId: HALL,
        createdAt: { gte: new Date((status.body as any).session.openedAt) },
        OR: [{ transactionId: null }, { transaction: { voidedAt: null } }],
      },
      _sum: { amount: true },
    });
    expect(Number(liveTotal._sum.amount ?? 0)).toBe(
      (status.body as any).cashExpenses,
    );
  });

  it('guards voiding: staff needs their own open session, owners can always void', async () => {
    const staffLogged = await http()
      .post('/cash/expense')
      .set(authHeader('staffA', HALL))
      .send({ amount: '150', category: 'OTHER', description: 'Staff chai' })
      .expect(201);

    // The owner may void it even though staff logged it, while the galla is open.
    await http()
      .post(`/cash/expenses/${staffLogged.body.expense.id}/void`)
      .set(authHeader('ownerA', HALL))
      .send({ reason: 'Owner correction' })
      .expect(201);

    const other = await logExpense('200', 'OTHER', 'Owner voucher').expect(201);
    const staffAttempt = await http()
      .post(`/cash/expenses/${other.body.expense.id}/void`)
      .set(authHeader('staffA', HALL))
      .send({ reason: 'not mine' });
    expect(staffAttempt.status).toBe(403);
  });

  it('validates the range and the tenant', async () => {
    expect((await daily('2026-05-02', '2026-05-01')).status).toBe(400);
    expect((await daily('2026-01-01', '2026-06-01')).status).toBe(400);
    expect((await daily('12-05-2026', today)).status).toBe(400);

    const noBranch = await http()
      .get(`/cash/expenses/daily?from=${today}&to=${today}`)
      .set(authHeader('ownerA'));
    expect(noBranch.status).toBe(400);
    expect(noBranch.body.message).toContain('x-branch-id');

    const tenantB = await http()
      .get(`/cash/expenses/daily?from=${today}&to=${today}`)
      .set(authHeader('ownerB', HALL));
    expect(tenantB.status).toBe(403);

    const missing = await http()
      .post('/cash/expenses/00000000-0000-4000-8000-000000000000/void')
      .set(authHeader('ownerA', HALL))
      .send({ reason: 'ghost' });
    expect(missing.status).toBe(404);
  });
});
