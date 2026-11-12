import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const BIZ = tenants.A.id;

describe('Vendor transaction voiding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  const stamp = Date.now();
  let vendorId: string;
  let otherVendorId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    const vendor = await prisma.vendor.create({
      data: { businessName: `Void Spec Vendor ${stamp}`, businessId: BIZ },
    });
    vendorId = vendor.id;

    const other = await prisma.vendor.create({
      data: { businessName: `Void Spec Other ${stamp}`, businessId: BIZ },
    });
    otherVendorId = other.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const pay = (amount: number, user: Parameters<typeof authHeader>[0] = 'ownerA') =>
    http()
      .post(`/vendors/${vendorId}/payment`)
      .set(authHeader(user))
      .send({ amount, description: 'Typed one extra zero' });

  const voidTx = (
    txId: string,
    reason = 'Amount typo, recorded again',
    user: Parameters<typeof authHeader>[0] = 'ownerA',
    vendor = vendorId,
  ) =>
    http()
      .post(`/vendors/${vendor}/transactions/${txId}/void`)
      .set(authHeader(user))
      .send({ reason });

  it('voids a large payment and restores the vendor balance', async () => {
    const paid = await pay(10_000_000);
    expect(paid.status).toBe(201);
    const originalId = paid.body.transaction.id;
    await expectBalanced(prisma, [originalId]);

    const before = await http()
      .get(`/vendors/${vendorId}`)
      .set(authHeader('ownerA'))
      .expect(200);
    expect(Number(before.body.vendor.balance)).not.toBe(0);

    const res = await voidTx(originalId);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.type).toBe('VENDOR_PAYMENT_REVERSAL');
    expect(res.body.transaction.reversesId).toBe(originalId);
    expect(res.body.transaction.description).toBe(
      'Void: Amount typo, recorded again',
    );

    const reversalId = res.body.transaction.id;
    await expectBalanced(prisma, [originalId, reversalId]);

    const original = await prisma.transaction.findUnique({
      where: { id: originalId },
      select: { voidedAt: true, voidReason: true, voidedById: true },
    });
    expect(original?.voidedAt).toBeTruthy();
    expect(original?.voidReason).toBe('Amount typo, recorded again');
    expect(original?.voidedById).toBeTruthy();

    const after = await http()
      .get(`/vendors/${vendorId}`)
      .set(authHeader('ownerA'))
      .expect(200);
    expect(Number(after.body.vendor.balance)).toBe(0);
    expect(Number(after.body.vendor.metrics.totalPaid)).toBe(0);

    const rows = after.body.vendor.ledger as Array<Record<string, unknown>>;
    const voidedRow = rows.find((r) => r.transactionId === originalId);
    expect(voidedRow?.isVoided).toBe(true);
    expect(voidedRow?.voidReason).toBe('Amount typo, recorded again');
    const reversalRow = rows.find((r) => r.transactionId === reversalId);
    expect(reversalRow?.isReversal).toBe(true);
  });

  it('refuses to void the same transaction twice', async () => {
    const paid = await pay(500);
    expect(paid.status).toBe(201);
    const txId = paid.body.transaction.id;

    await voidTx(txId).expect(201);
    const res = await voidTx(txId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This transaction is already voided.');
  });

  it('refuses to void a reversal', async () => {
    const paid = await pay(700);
    const txId = paid.body.transaction.id;
    const voided = await voidTx(txId).expect(201);

    const res = await voidTx(voided.body.transaction.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'A reversing transaction cannot itself be voided.',
    );
  });

  it('forbids staff from voiding', async () => {
    const paid = await pay(900, 'managerA');
    expect(paid.status).toBe(201);
    const txId = paid.body.transaction.id;

    const res = await voidTx(txId, 'Staff tried', 'staffA');
    expect(res.status).toBe(403);
    expect(
      await prisma.transaction.count({
        where: { reversesId: txId },
      }),
    ).toBe(0);
  });

  it('hides another tenant transaction behind a 404', async () => {
    const paid = await pay(1200);
    const txId = paid.body.transaction.id;

    const res = await voidTx(txId, 'Cross tenant attempt', 'ownerB');
    expect(res.status).toBe(404);

    const asOtherVendor = await voidTx(txId, 'Wrong vendor', 'ownerA', otherVendorId);
    expect(asOtherVendor.status).toBe(404);
    expect(asOtherVendor.body.message).toBe('Transaction not found.');
  });

  it('requires a reason of at least three characters', async () => {
    const paid = await pay(1500);
    const txId = paid.body.transaction.id;

    const res = await voidTx(txId, 'no');
    expect(res.status).toBe(400);
  });
});
