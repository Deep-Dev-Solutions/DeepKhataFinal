import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const HALL = tenants.A.branches.hallRoad.id;

describe('Close register variance rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  const cleanup = async () => {
    const status = await http()
      .get('/cash/register/status')
      .set(authHeader('ownerA', HALL));
    if (status.body?.isOpen) {
      await http()
        .post('/cash/register/close')
        .set(authHeader('ownerA', HALL))
        .send({
          actualCash: String(status.body.expectedCash),
          branchId: HALL,
        });
    }
  };

  const open = (openingBalance: number) =>
    http()
      .post('/cash/register/open')
      .set(authHeader('ownerA', HALL))
      .send({ openingBalance });

  const close = (actualCash: string, notes?: string) =>
    http()
      .post('/cash/register/close')
      .set(authHeader('ownerA', HALL))
      .send({ actualCash, branchId: HALL, ...(notes ? { notes } : {}) });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('accepts a balanced close without a note and a variance close with one', async () => {
    await open(2000).expect(201);

    const balanced = await close('2000').expect(201);
    expect(Number(balanced.body.session.difference)).toBe(0);
    expect(balanced.body.session.notes).toBeNull();

    await open(2000).expect(201);
    const short = await close('1800', 'Rs 200 short — change given').expect(201);
    expect(Number(short.body.session.actualCash)).toBe(1800);
    expect(Number(short.body.session.difference)).toBe(-200);
    expect(short.body.session.notes).toBe('Rs 200 short — change given');
  });

  it('refuses a variance with no note and validates the amount', async () => {
    await open(1500).expect(201);

    const noNote = await close('1400');
    expect(noNote.status).toBe(400);
    expect(noNote.body.message).toContain('note is required');

    // Whitespace is not a note.
    const blank = await close('1400', '   ');
    expect(blank.status).toBe(400);

    const negative = await close('-1', 'nope');
    expect(negative.status).toBe(400);

    const notMoney = await close('12.345', 'three decimals');
    expect(notMoney.status).toBe(400);

    // The session is still open, so a correct close with a note then works.
    const ok = await close('1500').expect(201);
    expect(Number(ok.body.session.difference)).toBe(0);
  });
});
