import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, freshSessionToken, users, tenants } from './setup/auth';

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const TENANT_A = tenants.A.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;
const HOUR = 3600 * 1000;

/** F1, F2, F3 from docs/plan/runs/rbac-audit.md: role escalation and customer mass assignment. */
describe('RBAC escalation fixes F1-F3 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdInviteEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.invitation.deleteMany({ where: { email: { in: createdInviteEmails } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  /** A throwaway STAFF member of tenant A with its own session (role changes revoke sessions). */
  async function makeMember() {
    const email = `esc-${uniq()}@deepkhata.test`;
    const user = await prisma.user.create({
      data: {
        name: 'Escalation Target',
        email,
        role: 'STAFF',
        businessId: TENANT_A,
        emailVerified: true,
      },
    });
    createdUserIds.push(user.id);
    const token = await freshSessionToken(prisma, user.id);
    return { id: user.id, email, token };
  }

  const owner = () => authHeader('ownerA', HAFEEZ);

  describe('F1: PUT /team/role and PATCH /team/updaterole', () => {
    const routes: Array<['put' | 'patch', string]> = [
      ['put', '/team/role'],
      ['patch', '/team/updaterole'],
    ];

    for (const [method, path] of routes) {
      it(`${method.toUpperCase()} ${path}: SUPER_ADMIN and OWNER are rejected with 400, DB role unchanged`, async () => {
        const member = await makeMember();
        for (const role of ['SUPER_ADMIN', 'OWNER', 'ADMIN', '', null]) {
          const res = await http()[method](path).set(owner()).send({ email: member.email, role });
          expect(res.status).toBe(400);
        }
        const missing = await http()[method](path).set(owner()).send({ email: member.email });
        expect(missing.status).toBe(400);

        const row = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
        expect(row.role).toBe('STAFF');
        expect(row.businessId).toBe(TENANT_A);

        // The member session is still valid (nothing was revoked) and agency stays closed.
        const bearer = { Authorization: `Bearer ${member.token}`, 'x-branch-id': HAFEEZ };
        const agency = await http().get('/agency/tenants').set(bearer);
        expect([401, 403]).toContain(agency.status);
        const own = await http().get('/auth/me').set(bearer);
        expect(own.status).not.toBe(401);
      });
    }

    it('owner can still change a member to MANAGER and back to STAFF (both routes)', async () => {
      const member = await makeMember();
      const up = await http().put('/team/role').set(owner()).send({ email: member.email, role: 'MANAGER' });
      expect(up.status).toBe(200);
      expect(up.body.user.role).toBe('MANAGER');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe('MANAGER');

      const down = await http()
        .patch('/team/updaterole')
        .set(owner())
        .send({ email: member.email, role: 'STAFF' });
      expect(down.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe('STAFF');
    });

    it('owner cannot change their own role or the role of another tenant user', async () => {
      const self = await http()
        .put('/team/role')
        .set(owner())
        .send({ email: users.ownerA.email, role: 'STAFF' });
      expect(self.status).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: users.ownerA.id } })).role).toBe('OWNER');

      const other = await http()
        .put('/team/role')
        .set(owner())
        .send({ email: users.ownerB.email, role: 'STAFF' });
      expect(other.status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: users.ownerB.id } })).role).toBe('OWNER');
    });

    it('MANAGER and STAFF cannot call either route (403) and nothing changes', async () => {
      const member = await makeMember();
      for (const who of ['managerA', 'staffA'] as const) {
        for (const [method, path] of routes) {
          const res = await http()
            [method](path)
            .set(authHeader(who, HAFEEZ))
            .send({ email: member.email, role: 'MANAGER' });
          expect(res.status).toBe(403);
        }
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe('STAFF');
    });

    it('POST /team/invite refuses OWNER and SUPER_ADMIN roles (403) and stores nothing', async () => {
      for (const role of ['SUPER_ADMIN', 'OWNER']) {
        const email = `inv-${uniq()}@deepkhata.test`;
        const res = await http().post('/team/invite').set(owner()).send({ email, role });
        expect(res.status).toBe(403);
        expect(await prisma.invitation.count({ where: { email } })).toBe(0);
      }
    });

    it('a legacy SUPER_ADMIN invitation cannot be accepted', async () => {
      const email = `legacy-${uniq()}@deepkhata.test`;
      const token = `legacy-${uniq()}`;
      createdInviteEmails.push(email);
      await prisma.invitation.create({
        data: { email, role: 'SUPER_ADMIN', token, businessId: TENANT_A },
      });
      const res = await http().post('/team/join').send({ token, name: 'Legacy', password: 'DeepKhata#Test1' });
      expect(res.status).toBe(400);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });
  });

  describe('F2: POST /settings/staff', () => {
    beforeAll(async () => {
      // Plan seats count members plus pending invites; free the seats the F1 members used.
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.invitation.deleteMany({ where: { email: { in: createdInviteEmails } } });
    });

    it('rejects SUPER_ADMIN, OWNER and unknown roles with 400 and creates no invitation', async () => {
      for (const role of ['SUPER_ADMIN', 'OWNER', 'GOD', undefined]) {
        const email = `staff-${uniq()}@deepkhata.test`;
        createdInviteEmails.push(email);
        const res = await http().post('/settings/staff').set(owner()).send({ email, role });
        expect(res.status).toBe(400);
        expect(await prisma.invitation.count({ where: { email } })).toBe(0);
      }
    });

    it('creates an expiring STAFF invitation (same path as /team/invite)', async () => {
      const email = `staff-${uniq()}@deepkhata.test`;
      createdInviteEmails.push(email);
      const res = await http().post('/settings/staff').set(owner()).send({ email, role: 'STAFF' });
      expect(res.status).toBeLessThan(300);
      const invite = await prisma.invitation.findFirstOrThrow({ where: { email, businessId: TENANT_A } });
      expect(invite.role).toBe('STAFF');
      expect(invite.expiresAt).not.toBeNull();
      const ttl = invite.expiresAt!.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(70 * HOUR);
      expect(ttl).toBeLessThanOrEqual(72 * HOUR + 60 * 1000);
    });

    it('MANAGER and STAFF cannot use the settings alias (403)', async () => {
      for (const who of ['managerA', 'staffA'] as const) {
        const email = `staff-${uniq()}@deepkhata.test`;
        createdInviteEmails.push(email);
        const res = await http()
          .post('/settings/staff')
          .set(authHeader(who, HAFEEZ))
          .send({ email, role: 'STAFF' });
        expect(res.status).toBe(403);
        expect(await prisma.invitation.count({ where: { email } })).toBe(0);
      }
    });
  });

  describe('F3: PUT /customer/customerdetails/:id', () => {
    async function makeCustomerWithOrder() {
      const customer = await prisma.customer.create({
        data: {
          name: `Esc Customer ${uniq()}`,
          phone: `0300${Math.floor(1000000 + Math.random() * 8999999)}`,
          creditLimit: 12345,
          isDefaulter: true,
          businessId: TENANT_A,
        },
      });
      createdCustomerIds.push(customer.id);
      const order = await prisma.order.create({
        data: {
          customerId: customer.id,
          businessId: TENANT_A,
          branchId: HAFEEZ,
          status: 'COMPLETED',
          totalAmount: 100,
        },
      });
      return { customer, order };
    }

    const writers = ['staffA', 'managerA', 'ownerA'] as const;

    for (const who of writers) {
      it(`${who}: creditLimit, isDefaulter, businessId, id and nested writes cannot reach prisma`, async () => {
        const { customer, order } = await makeCustomerWithOrder();
        const res = await http()
          .put(`/customer/customerdetails/${customer.id}`)
          .set(authHeader(who, HAFEEZ))
          .send({
            name: 'Renamed Safely',
            creditLimit: 9999999,
            isDefaulter: false,
            businessId: tenants.B.id,
            id: '00000000-0000-4000-8000-0000000000ff',
            orders: { deleteMany: {} },
            khataEntries: { deleteMany: {} },
            business: { delete: true },
          });
        // Unknown keys are stripped by the whitelist pipe (or the request is rejected).
        expect([200, 400]).toContain(res.status);

        const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
        expect(after.businessId).toBe(TENANT_A);
        expect(after.id).toBe(customer.id);
        expect(after.creditLimit.toString()).toBe(customer.creditLimit.toString());
        expect(after.isDefaulter).toBe(true);
        expect(await prisma.order.count({ where: { id: order.id, customerId: customer.id } })).toBe(1);
        expect(await prisma.business.count({ where: { id: TENANT_A } })).toBe(1);
        if (res.status === 200) expect(after.name).toBe('Renamed Safely');
      });
    }

    it('a normal profile edit still works for STAFF and keeps risk fields', async () => {
      const { customer } = await makeCustomerWithOrder();
      const res = await http()
        .put(`/customer/customerdetails/${customer.id}`)
        .set(authHeader('staffA', HAFEEZ))
        .send({
          name: 'Profile Edited',
          phone: customer.phone,
          email: 'edited@example.com',
          address: 'Shop 5, Hall Road',
          cnicNumber: '35202-1234567-1',
          guarantorPhone: '03111234567',
          paymentTermsDays: 15,
        });
      expect(res.status).toBe(200);
      const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(after).toMatchObject({
        name: 'Profile Edited',
        email: 'edited@example.com',
        address: 'Shop 5, Hall Road',
        cnicNumber: '35202-1234567-1',
        guarantorPhone: '03111234567',
        paymentTermsDays: 15,
        businessId: TENANT_A,
      });
      expect(after.creditLimit.toString()).toBe(customer.creditLimit.toString());
      expect(after.isDefaulter).toBe(true);
    });

    it('invalid profile values are rejected with 400', async () => {
      const { customer } = await makeCustomerWithOrder();
      const bad = await http()
        .put(`/customer/customerdetails/${customer.id}`)
        .set(authHeader('staffA', HAFEEZ))
        .send({ name: null, paymentTermsDays: 'soon' });
      expect(bad.status).toBe(400);
    });

    it('tenant B owner gets 404 for a tenant A customer and nothing changes', async () => {
      const { customer } = await makeCustomerWithOrder();
      const res = await http()
        .put(`/customer/customerdetails/${customer.id}`)
        .set(authHeader('ownerB'))
        .send({ name: 'Hijacked' });
      expect(res.status).toBe(404);
      const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(after.name).toBe(customer.name);
      expect(after.businessId).toBe(TENANT_A);
    });

    it('STAFF cannot choose a credit limit on newcustomer; OWNER can', async () => {
      const staffRes = await http()
        .post('/customer/newcustomer')
        .set(authHeader('staffA', HAFEEZ))
        .send({ name: `Esc New S ${uniq()}`, phone: `0301${uniq().slice(-7)}`, creditLimit: 9999999 });
      expect(staffRes.status).toBeLessThan(300);
      createdCustomerIds.push(staffRes.body.customer.id);
      expect(Number(staffRes.body.customer.creditLimit)).toBe(50000);

      const ownerRes = await http()
        .post('/customer/newcustomer')
        .set(owner())
        .send({ name: `Esc New O ${uniq()}`, phone: `0302${uniq().slice(-7)}`, creditLimit: 7000 });
      expect(ownerRes.status).toBeLessThan(300);
      createdCustomerIds.push(ownerRes.body.customer.id);
      expect(Number(ownerRes.body.customer.creditLimit)).toBe(7000);
    });
  });
});
