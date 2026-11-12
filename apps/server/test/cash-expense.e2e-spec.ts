import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const BIZ = tenants.A.id;

describe('Cash expenses: branch, register and galla guards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const branchName = `T3 expense ${Date.now()}`;
  let branchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    const branch = await prisma.branch.create({
      data: { id: randomUUID(), businessId: BIZ, name: branchName },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const post = (user: Parameters<typeof authHeader>[0], body: object, branch = branchId) =>
    http()
      .post('/cash/expense')
      .set(authHeader(user, branch))
      .send(body);

  it('refuses an expense while the register is closed', async () => {
    const res = await post('ownerA', { amount: '500', category: 'CHAI_REFRESHMENT' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'REGISTER_CLOSED',
      message: 'Galla band hai. Pehle register kholen.',
    });
    expect(
      await prisma.expense.count({ where: { businessId: BIZ, branchId } }),
    ).toBe(0);
  });

  it('opens the register for the branch', async () => {
    const res = await http()
      .post('/cash/register/open')
      .set(authHeader('ownerA', branchId))
      .send({ openingBalance: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.session.branchId).toBe(branchId);
  });

  it('blocks a staff expense larger than the cash in the galla', async () => {
    const res = await post('staffA', { amount: '1500', category: 'REPAIR_PARTS' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'GALLA_INSUFFICIENT',
      available: '1000',
    });
    expect(res.body.message).toContain('Galla mein sirf Rs');
  });

  it('does not let staff pass an override reason', async () => {
    const res = await post('staffA', {
      amount: '100',
      category: 'REPAIR_PARTS',
      overrideReason: 'Owner said it is fine',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Only an owner or manager');
  });

  it('logs an expense inside the galla and links it to the open session', async () => {
    const res = await post('ownerA', {
      amount: '100',
      category: 'CHAI_REFRESHMENT',
      description: 'Chai for the counter',
    });

    expect(res.status).toBe(201);
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: res.body.expense.id },
    });
    expect(expense).toMatchObject({
      businessId: BIZ,
      branchId,
      description: 'Chai for the counter',
    });
    expect(expense.sessionId).not.toBeNull();
    expect(expense.transactionId).not.toBeNull();
    await expectBalanced(prisma, [expense.transactionId!]);
  });

  it('takes the branch from the header, not from the body', async () => {
    const res = await post('ownerA', {
      amount: '50',
      category: 'CHAI_REFRESHMENT',
      branchId: tenants.A.branches.hallRoad.id,
    });

    expect(res.status).toBe(201);
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: res.body.expense.id },
    });
    expect(expense.branchId).toBe(branchId);
  });

  it('lets an owner override with a reason and records it', async () => {
    const res = await post('ownerA', {
      amount: '1500',
      category: 'DELIVERY_RIDER',
      description: 'Rider paid from home cash',
      overrideReason: 'Paid rider from home cash, will add tomorrow',
    });

    expect(res.status).toBe(201);
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: res.body.expense.id },
    });
    expect(expense.description).toBe(
      '[OVERRIDE: Paid rider from home cash, will add tomorrow] Rider paid from home cash',
    );
    await expectBalanced(prisma, [expense.transactionId!]);
  });

  it('rejects a branch that belongs to another business', async () => {
    const res = await http()
      .post('/cash/expense')
      .set(authHeader('ownerB', branchId))
      .send({ amount: '10', category: 'CHAI_REFRESHMENT' });

    // The session guard validates x-branch-id before the handler runs.
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Invalid branch');
  });

  it('rejects money with more than two decimals', async () => {
    const res = await post('ownerA', { amount: '12.345', category: 'CHAI_REFRESHMENT' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric amount', async () => {
    const res = await post('ownerA', { amount: 'abc', category: 'CHAI_REFRESHMENT' });
    expect(res.status).toBe(400);
  });

  it('rejects an override reason shorter than 3 characters', async () => {
    const res = await post('ownerA', {
      amount: '9000',
      category: 'CHAI_REFRESHMENT',
      overrideReason: 'ok',
    });
    expect(res.status).toBe(400);
  });
});
