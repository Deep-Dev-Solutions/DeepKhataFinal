import * as dotenv from 'dotenv';
dotenv.config();

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../dist/app.module.js';
import * as bcrypt from 'bcrypt';
import { PrismaClient, BusinessStatus, Role } from '@prisma/client';

describe('Phase 5 — Agency Billing Engine & Tenant Kill Switch (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const run = `${Date.now()}`;
  const cleanupIds: { userIds: string[]; businessIds: string[] } = {
    userIds: [],
    businessIds: [],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (prisma && cleanupIds.userIds.length) {
      await prisma.user.updateMany({
        where: { id: { in: cleanupIds.userIds } },
        data: { businessId: null },
      });
      await prisma.business.deleteMany({
        where: { id: { in: cleanupIds.businessIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: cleanupIds.userIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function createTenant(opts: {
    tag: string;
    status: BusinessStatus;
    subscriptionExpiresAt?: Date;
  }) {
    const email = `phase5_${opts.tag}_${run}@example.com`;
    const password = 'Phase5Test@123';
    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: `Phase5 ${opts.tag} Owner`,
        email,
        password: hash,
        role: Role.OWNER,
      },
    });
    cleanupIds.userIds.push(user.id);

    const business = await prisma.business.create({
      data: {
        name: `Phase5 ${opts.tag} Biz ${run}`,
        slug: `phase5-${opts.tag}-${run}`,
        email,
        ownerId: user.id,
        status: opts.status,
        subscriptionExpiresAt: opts.subscriptionExpiresAt ?? null,
      },
    });
    cleanupIds.businessIds.push(business.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { businessId: business.id },
    });

    return { email, password, business, user };
  }

  async function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  it('allows a READ_ONLY tenant to log in and read their data', async () => {
    const tenant = await createTenant({
      tag: 'readonly',
      status: BusinessStatus.READ_ONLY,
      subscriptionExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const res = await login(tenant.email, tenant.password);
    expect([200, 201]).toContain(res.status);
    expect(res.body.accessToken).toBeDefined();

    // GET is permitted in read-only mode
    const getRes = await request(app.getHttpServer())
      .get('/businessinfo')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toBeDefined();
  });

  it('blocks POST for a READ_ONLY tenant with 403', async () => {
    const tenant = await createTenant({
      tag: 'readonlyblock',
      status: BusinessStatus.READ_ONLY,
    });

    const res = await login(tenant.email, tenant.password);
    expect([200, 201]).toContain(res.status);

    const postRes = await request(app.getHttpServer())
      .post('/order/neworder')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ customerId: null, items: [] });

    expect(postRes.status).toBe(403);
    expect(postRes.body.message).toBe(
      'Subscription expired. System is in read-only mode.',
    );
  });

  it('blocks login entirely for a SUSPENDED tenant with 403', async () => {
    const tenant = await createTenant({
      tag: 'suspended',
      status: BusinessStatus.SUSPENDED,
    });

    const res = await login(tenant.email, tenant.password);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      'Account suspended. Contact DeepKhata administration.',
    );
  });

  it('blocks writes once the subscription expires even when status is ACTIVE', async () => {
    const tenant = await createTenant({
      tag: 'expired',
      status: BusinessStatus.ACTIVE,
      subscriptionExpiresAt: new Date(Date.now() - 1),
    });

    const res = await login(tenant.email, tenant.password);
    expect([200, 201]).toContain(res.status);

    const postRes = await request(app.getHttpServer())
      .post('/order/neworder')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ customerId: null, items: [] });

    expect(postRes.status).toBe(403);
    expect(postRes.body.message).toBe(
      'Subscription expired. System is in read-only mode.',
    );
  });
});