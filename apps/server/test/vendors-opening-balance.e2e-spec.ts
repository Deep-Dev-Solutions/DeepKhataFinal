import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const BIZ = tenants.A.id;

describe('Vendor opening balance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  const stamp = Date.now();
  let vendorId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    const vendor = await prisma.vendor.create({
      data: { businessName: `Opening Spec Vendor ${stamp}`, businessId: BIZ },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const open = (amount = 25_000) =>
    http()
      .post(`/vendors/${vendorId}/opening-balance`)
      .set(authHeader('ownerA'))
      .send({ amount, description: 'Udhar from the old register' });

  it('records purani udhar against equity, not inventory', async () => {
    const res = await open();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.type).toBe('VENDOR_OPENING_BALANCE');

    const postings = res.body.transaction.postings as Array<{
      accountId: string;
      accountType: string;
      amount: string;
    }>;
    expect(postings).toHaveLength(2);
    const equity = postings.find((p) => p.accountId === 'OPENING_BALANCE_EQUITY');
    expect(equity?.accountType).toBe('EQUITY');
    expect(Number(equity?.amount)).toBe(25_000);
    const payable = postings.find((p) => p.accountId === vendorId);
    expect(payable?.accountType).toBe('VENDOR_PAYABLE');
    expect(Number(payable?.amount)).toBe(-25_000);
    await expectBalanced(prisma, [res.body.transaction.id]);

    const details = await http()
      .get(`/vendors/${vendorId}`)
      .set(authHeader('ownerA'))
      .expect(200);
    expect(Number(details.body.vendor.balance)).toBe(25_000);
    const row = (
      details.body.vendor.ledger as Array<Record<string, unknown>>
    ).find((r) => r.type === 'VENDOR_OPENING_BALANCE');
    expect(row?.isVoided).toBe(false);
  });

  it('allows only one opening balance per vendor', async () => {
    const res = await open(1_000);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'Opening balance is already recorded for this vendor. Void the existing entry to correct it.',
    );
  });

  it('returns 410 on the old manual purchase route', async () => {
    const res = await http()
      .post(`/vendors/${vendorId}/purchase`)
      .set(authHeader('ownerA'))
      .send({ amount: 5_000 });
    expect(res.status).toBe(410);
    expect(res.body.message).toContain('Restock Hub');
  });

  it('lets the owner void and re-record the opening balance', async () => {
    const ledger = await prisma.transaction.findFirstOrThrow({
      where: {
        businessId: BIZ,
        type: 'VENDOR_OPENING_BALANCE',
        postings: { some: { accountId: vendorId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    await http()
      .post(`/vendors/${vendorId}/transactions/${ledger.id}/void`)
      .set(authHeader('ownerA'))
      .send({ reason: 'Wrong opening figure' })
      .expect(201);

    const again = await open(30_000);
    expect(again.status).toBe(201);

    const details = await http()
      .get(`/vendors/${vendorId}`)
      .set(authHeader('ownerA'))
      .expect(200);
    expect(Number(details.body.vendor.balance)).toBe(30_000);
  });

  it('hides another tenant vendor behind a 404', async () => {
    await http()
      .post(`/vendors/${vendorId}/opening-balance`)
      .set(authHeader('ownerB'))
      .send({ amount: 100 })
      .expect(404);
  });
});
