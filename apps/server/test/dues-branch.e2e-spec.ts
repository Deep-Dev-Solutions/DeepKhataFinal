import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

describe('Dues rows carry their branch and can be filtered (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now();

  const hallParty = `Branch Hall ${stamp}`;
  const hafeezParty = `Branch Hafeez ${stamp}`;

  const createEntry = (branchId: string, partyName: string) =>
    http()
      .post('/khata-entries')
      .set(authHeader('ownerA', branchId))
      .send({
        direction: 'RECEIVABLE',
        partyType: 'OTHER',
        partyName,
        amount: 500,
        dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        counterAccount: 'REVENUE',
      });

  const listDues = (query = '') =>
    http()
      .get(`/dues?direction=receivable${query}`)
      .set(authHeader('ownerA', HALL));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    await createEntry(HALL, hallParty).expect(201);
    await createEntry(HAFEEZ, hafeezParty).expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('returns the branch name on receivable rows from every branch', async () => {
    const res = await listDues().expect(200);
    const items = res.body.items as Array<any>;
    const hall = items.find((i) => i.partyName === hallParty);
    const hafeez = items.find((i) => i.partyName === hafeezParty);

    expect(hall).toBeTruthy();
    expect(hall.branch).toEqual({ id: HALL, name: 'Hall Road' });
    expect(hafeez).toBeTruthy();
    expect(hafeez.branch).toEqual({ id: HAFEEZ, name: 'Hafeez Centre' });
  });

  it('scope=branch filters the list to the header branch', async () => {
    const res = await listDues('&scope=branch').expect(200);
    const names = (res.body.items as Array<any>).map((i) => i.partyName);
    expect(names).toContain(hallParty);
    expect(names).not.toContain(hafeezParty);
    for (const item of res.body.items as Array<any>) {
      expect(item.branch?.id).toBe(HALL);
    }
  });

  it('payables have no branch yet and stay out of the branch-only list', async () => {
    const res = await http()
      .get('/dues?direction=payable&scope=branch')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    expect(res.body.items).toEqual([]);

    const all = await http()
      .get('/dues?direction=payable')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    if (all.body.items.length > 0) {
      expect(all.body.items[0].branch).toBeNull();
    }
  });
});
