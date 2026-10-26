import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { addMonthsUtc } from '../src/plans/subscriptions.service';

const BIZ_A = tenants.A.id;
const NOW = new Date();
const START = NOW.toISOString().slice(0, 10);
const END = addMonthsUtc(NOW, 12).toISOString().slice(0, 10);

describe('Agency custom deals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('sets a 20,000/yr 2-branch deal, blocks a third branch, invoice shows 20,000', async () => {
    // 1. Set the deal: STANDARD plan, 20,000/yr, 2 branches, 10 users
    const dealRes = await http()
      .post(`/agency/tenants/${BIZ_A}/deal`)
      .set(authHeader('superAdmin'))
      .send({
        plan: 'STANDARD',
        price: '20000',
        billingCycle: 'YEARLY',
        startDate: START,
        endDate: END,
        maxBranches: 2,
        maxUsers: 10,
        notes: 'Annual renewal deal',
      });
    expect(dealRes.status).toBe(201);
    expect(dealRes.body.subscription.priceOverride).toBe(20000);
    expect(dealRes.body.subscription.billingCycle).toBe('YEARLY');

    // 2. A third branch is blocked (tenant A already has 2 seeded branches)
    const branchRes = await http()
      .post(`/agency/branch/${BIZ_A}`)
      .set(authHeader('superAdmin'))
      .send({ name: 'Third Branch', location: 'Lahore' });
    expect(branchRes.status).toBe(403);
    expect(branchRes.body.code).toBe('PLAN_LIMIT_REACHED');

    // 3. Cross-tenant: tenant B cannot see tenant A's deal
    const crossRes = await http()
      .get(`/agency/tenants/${tenants.B.id}/deal-history`)
      .set(authHeader('superAdmin'));
    expect(crossRes.status).toBe(200);
    expect(crossRes.body).toEqual([]);

    // 4. Deal history shows the set-deal row
    const historyRes = await http()
      .get(`/agency/tenants/${BIZ_A}/deal-history`)
      .set(authHeader('superAdmin'));
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(1);
    const row = historyRes.body[0];
    expect(row.new.plan).toBe('STANDARD');
    expect(row.new.priceOverride).toBe('20000');
    expect(row.new.customLimits.maxBranches).toBe(2);
    expect(row.notes).toBe('Annual renewal deal');

    // 5. Invoice defaults to priceOverride: 20,000
    const invRes = await http()
      .post('/agency/billing/invoices')
      .set(authHeader('superAdmin'))
      .send({
        businessId: BIZ_A,
        billingCycle: 'YEARLY',
        periodStart: START,
        periodEnd: END,
      });
    expect(invRes.status).toBe(201);
    expect(invRes.body.lines).toHaveLength(1);
    expect(invRes.body.lines[0].description).toContain('Standard plan');
    expect(Number(invRes.body.lines[0].unitPrice)).toBe(20000);
    expect(Number(invRes.body.total)).toBe(20000);
  });
});
