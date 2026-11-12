import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const HALL = tenants.A.branches.hallRoad.id;

describe('Z-report completeness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  let session1Id = '';
  let expenseId = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('puts a voucher in the report of the galla it was logged in', async () => {
    const status = await http()
      .get('/cash/register/status')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    if (status.body.isOpen) {
      const closed = await http()
        .post('/cash/register/close')
        .set(authHeader('ownerA', HALL))
        .send({ actualCash: status.body.expectedCash, branchId: HALL })
        .expect(201);
      expect(closed.body.success).toBe(true);
    }

    const opened = await http()
      .post('/cash/register/open')
      .set(authHeader('ownerA', HALL))
      .send({ openingBalance: 5000 })
      .expect(201);
    session1Id = opened.body.session.id;

    const expense = await http()
      .post('/cash/expense')
      .set(authHeader('ownerA', HALL))
      .send({ amount: '300', category: 'CHAI_REFRESHMENT', description: 'Z report chai' })
      .expect(201);
    expenseId = expense.body.expense.id;

    const live = await http()
      .get('/cash/register/status')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    expect(live.body.cashExpenses).toBe(300);
    expect(live.body.expectedCash).toBe(4700);

    await http()
      .post('/cash/register/close')
      .set(authHeader('ownerA', HALL))
      .send({ actualCash: live.body.expectedCash, branchId: HALL })
      .expect(201);

    const z = await http()
      .get(`/cash/register/z-report?sessionId=${session1Id}`)
      .set(authHeader('ownerA', HALL))
      .expect(200);
    expect(z.body.report.expensesCount).toBe(1);
    expect(z.body.report.summary.cashExpenses).toBe(300);
    expect((z.body.report.itemizedExpenses as Array<any>).map((e) => e.id)).toContain(expenseId);
    expect(z.body.report.expensesByCategory.CHAI_REFRESHMENT).toEqual({ total: 300, count: 1 });
    expect(z.body.report.adjustments).toEqual([]);
  });

  it('a voucher voided after closing comes back as an adjustment of the next galla', async () => {
    const opened = await http()
      .post('/cash/register/open')
      .set(authHeader('ownerA', HALL))
      .send({ openingBalance: 1000 })
      .expect(201);
    const session2Id = opened.body.session.id;

    await http()
      .post(`/cash/expenses/${expenseId}/void`)
      .set(authHeader('ownerA', HALL))
      .send({ reason: 'Chai was Rs 100' })
      .expect(201);

    const z2 = await http()
      .get(`/cash/register/z-report?sessionId=${session2Id}`)
      .set(authHeader('ownerA', HALL))
      .expect(200);
    const report = z2.body.report;
    expect(report.adjustments).toHaveLength(1);
    expect(report.adjustments[0].expenseId).toBe(expenseId);
    expect(report.adjustments[0].amount).toBe(300);
    expect(report.summary.cashAdjustments).toBe(300);
    expect(report.summary.cashExpenses).toBe(0);
    expect(report.summary.expectedCash).toBe(1300);

    // The closed galla keeps reporting the voucher it paid, now marked voided.
    const z1 = await http()
      .get(`/cash/register/z-report?sessionId=${session1Id}`)
      .set(authHeader('ownerA', HALL))
      .expect(200);
    expect(z1.body.report.expensesCount).toBe(1);
    expect(z1.body.report.summary.cashExpenses).toBe(300);
    expect(z1.body.report.summary.expectedCash).toBe(4700);
    const row = (z1.body.report.itemizedExpenses as Array<any>)[0];
    expect(row.isVoided).toBe(true);
    expect(row.voidReason).toBe('Chai was Rs 100');
    await expectBalanced(prisma);
  });

  it('keeps orphan vouchers of the branch in the window inside the report', async () => {
    const open = await prisma.cashRegisterSession.findFirstOrThrow({
      where: { businessId: tenants.A.id, branchId: HALL, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    const legacy = await http()
      .post('/cash/expense')
      .set(authHeader('ownerA', HALL))
      .send({ amount: '250', category: 'OTHER', description: 'Legacy voucher' })
      .expect(201);

    // Simulate a voucher written before sessions were attached.
    await prisma.expense.update({
      where: { id: legacy.body.expense.id },
      data: { sessionId: null },
    });

    const z = await http()
      .get(`/cash/register/z-report?sessionId=${open.id}`)
      .set(authHeader('ownerA', HALL))
      .expect(200);
    expect((z.body.report.itemizedExpenses as Array<any>).map((e) => e.id)).toContain(
      legacy.body.expense.id,
    );
    expect(z.body.report.summary.cashExpenses).toBe(250);
    expect(z.body.report.expensesByCategory.OTHER).toEqual({ total: 250, count: 1 });

    // Tenant B cannot read tenant A's session.
    const other = await http()
      .get(`/cash/register/z-report?sessionId=${open.id}`)
      .set(authHeader('ownerB', tenants.B.branches.mainBranch.id));
    expect(other.status).toBe(404);
  });
});
