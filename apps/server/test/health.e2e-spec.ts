import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';

describe('Health and auth harness (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('GET /health reports ok with the database up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });

  it('rejects a protected route without a token', async () => {
    await request(app.getHttpServer()).get('/customer/getallcustomers').expect(401);
  });

  it('allows a protected route with a seeded owner token', async () => {
    const res = await request(app.getHttpServer())
      .get('/customer/getallcustomers')
      .set(authHeader('ownerA'))
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
