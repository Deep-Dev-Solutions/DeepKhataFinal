import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants, users } from './setup/auth';
import { verifyLicence } from '../../desktop/src/licence/verify';

describe('Desktop server mode: devices, licence, push, pull (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  beforeAll(async () => {
    process.env.LICENSE_PRIVATE_KEY_PEM = privatePem;
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    delete process.env.LICENSE_PRIVATE_KEY_PEM;
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  describe('Device management (/desktop/devices)', () => {
    it('owner creates a device token, non-owner is 403', async () => {
      const staffRes = await http()
        .post('/desktop/devices')
        .set(authHeader('staffA'))
        .send({ name: 'Staff POS' });
      expect(staffRes.status).toBe(403);

      const ownerRes = await http()
        .post('/desktop/devices')
        .set(authHeader('ownerA'))
        .send({ name: 'Front Counter PC' });
      expect(ownerRes.status).toBe(201);
      expect(typeof ownerRes.body.deviceId).toBe('string');
      expect(typeof ownerRes.body.deviceToken).toBe('string');

      // Verify row exists in DB
      const dbDevice = await prisma.device.findUnique({
        where: { id: ownerRes.body.deviceId },
      });
      expect(dbDevice).toBeDefined();
      expect(dbDevice?.businessId).toBe(tenants.A.id);
      expect(dbDevice?.name).toBe('Front Counter PC');
      expect(dbDevice?.revokedAt).toBeNull();
    });

    it('lists devices for the tenant with isolation', async () => {
      const listA = await http().get('/desktop/devices').set(authHeader('ownerA'));
      expect(listA.status).toBe(200);
      expect(Array.isArray(listA.body)).toBe(true);
      expect(listA.body.some((d: any) => d.name === 'Front Counter PC')).toBe(true);

      const listB = await http().get('/desktop/devices').set(authHeader('ownerB'));
      expect(listB.status).toBe(200);
      expect(listB.body.every((d: any) => d.name !== 'Front Counter PC')).toBe(true);
    });

    it('revokes a device', async () => {
      const createRes = await http()
        .post('/desktop/devices')
        .set(authHeader('ownerA'))
        .send({ name: 'Old Register' });
      const { deviceId, deviceToken } = createRes.body;

      // Cross-tenant revoke -> 404
      const wrongOwner = await http()
        .post(`/desktop/devices/${deviceId}/revoke`)
        .set(authHeader('ownerB'));
      expect(wrongOwner.status).toBe(404);

      // Owner revoke -> 201/200
      const revokeRes = await http()
        .post(`/desktop/devices/${deviceId}/revoke`)
        .set(authHeader('ownerA'));
      expect(revokeRes.status).toBe(201);
      expect(revokeRes.body.id).toBe(deviceId);
      expect(revokeRes.body.revokedAt).toBeDefined();

      // Device token is now rejected with 403 Forbidden
      const pullWithRevoked = await http()
        .get('/sync/desktop/pull?entity=products')
        .set('Authorization', `Device ${deviceToken}`);
      expect(pullWithRevoked.status).toBe(403);
    });
  });

  describe('Device API endpoints', () => {
    let activeDeviceId: string;
    let activeDeviceToken: string;

    beforeAll(async () => {
      const res = await http()
        .post('/desktop/devices')
        .set(authHeader('ownerA'))
        .send({ name: 'Test Shop PC' });
      activeDeviceId = res.body.deviceId;
      activeDeviceToken = res.body.deviceToken;
    });

    it('issues a signed licence verified with the public key', async () => {
      const res = await http()
        .post('/desktop/licence')
        .set('Authorization', `Device ${activeDeviceToken}`);
      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe('string');

      const verification = verifyLicence(res.body.token, publicPem, new Date());
      expect(verification.state).toBe('valid');
      expect(verification.payload?.businessId).toBe(tenants.A.id);
      expect(verification.payload?.deviceId).toBe(activeDeviceId);
    });

    it('pulls sync data with Device auth', async () => {
      const res = await http()
        .get('/sync/desktop/pull?entity=products')
        .set('Authorization', `Device ${activeDeviceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.serverTime).toBeDefined();
      expect(Array.isArray(res.body.rows)).toBe(true);
    });

    it('pushes outbox events and enforces deviceId matching', async () => {
      // Mismatched deviceId -> 403
      const mismatch = await http()
        .post('/sync/desktop/push')
        .set('Authorization', `Device ${activeDeviceToken}`)
        .send({
          deviceId: '00000000-0000-0000-0000-000000000000',
          events: [],
        });
      expect(mismatch.status).toBe(403);

      // Create a customer event via push
      const pushRes = await http()
        .post('/sync/desktop/push')
        .set('Authorization', `Device ${activeDeviceToken}`)
        .send({
          deviceId: activeDeviceId,
          events: [
            {
              id: 'event-cust-1',
              entity: 'customer',
              entityId: 'cust-sync-1',
              op: 'create',
              payload: {
                name: 'Sync Customer A',
                phone: '03009999999',
              },
            },
          ],
        });
      expect(pushRes.status).toBe(201);
      expect(Array.isArray(pushRes.body.accepted)).toBe(true);
      expect(pushRes.body.accepted).toContain('event-cust-1');

      // Verify customer was created in DB
      const created = await prisma.customer.findFirst({
        where: { businessId: tenants.A.id, name: 'Sync Customer A' },
      });
      expect(created).toBeDefined();
    });
  });
});
