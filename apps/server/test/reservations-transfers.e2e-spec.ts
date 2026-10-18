import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, users, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';
import { ReservationsService } from '../src/reservations/reservations.service';

const kb = catalog.keyboard840;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;
const B_BRANCH = tenants.B.branches.mainBranch.id;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe('Reservations and branch transfers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const createdReservationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    // Put the shared seed stock back the way we found it for other files.
    for (const id of createdReservationIds) {
      const r = await prisma.stockReservation.findUnique({ where: { id } });
      if (r && r.status === 'ACTIVE') {
        await prisma.stockReservation.update({ where: { id }, data: { status: 'RELEASED' } });
        await prisma.productInstance.updateMany({
          where: { id: r.instanceId, status: 'RESERVED' },
          data: { status: 'AVAILABLE' },
        });
      }
    }
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const statusOf = async (instanceId: string) =>
    (await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceId } })).status;

  /** Own product so transfers never disturb the shared seeded stock. */
  async function makeStock(opts: { branchId: string; count: number; withCabinet?: boolean }) {
    const tag = uniq();
    const product = await prisma.product.create({
      data: {
        businessId: tenants.A.id,
        name: `T2 Transfer Widget ${tag}`,
        sku: `T2-TW-${tag}`,
        basePrice: 1000,
        minSalePrice: 800,
        searchText: `t2 transfer widget ${tag}`,
      },
    });
    const cabinet = opts.withCabinet
      ? await prisma.cabinet.findFirst({
          where: { businessId: tenants.A.id, branchId: opts.branchId, deletedAt: null },
        })
      : null;
    const instanceIds: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const inst = await prisma.productInstance.create({
        data: {
          productId: product.id,
          branchId: opts.branchId,
          cabinetId: cabinet?.id ?? null,
          unitCost: 500,
          status: 'AVAILABLE',
        },
      });
      instanceIds.push(inst.id);
    }
    return { product, instanceIds, cabinetId: cabinet?.id ?? null };
  }

  async function reserveKeyboard(user: 'staffA' | 'managerA', extra: Record<string, unknown> = {}) {
    const res = await http()
      .post('/reservations')
      .set(authHeader(user, HAFEEZ))
      .send({
        productId: kb.productId,
        branchId: HAFEEZ,
        customerName: `T2 Customer ${uniq()}`,
        customerPhone: '0300-0000000',
        ...extra,
      });
    if (res.body?.id) createdReservationIds.push(res.body.id);
    return res;
  }

  describe('reservations', () => {
    it('reserves a unit: instance RESERVED, finder shows reserved 1 / available 2, release restores it', async () => {
      const before = await prisma.productInstance.count({
        where: { productId: kb.productId, branchId: HAFEEZ, status: 'AVAILABLE' },
      });
      expect(before).toBe(3);

      const res = await reserveKeyboard('staffA');
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.productId).toBe(kb.productId);
      expect(res.body.branch.id).toBe(HAFEEZ);
      expect(kb.hafeezCentreInstanceIds).toContain(res.body.instanceId);
      expect(await statusOf(res.body.instanceId)).toBe('RESERVED');

      const row = await prisma.stockReservation.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.businessId).toBe(tenants.A.id);
      expect(row.status).toBe('ACTIVE');
      expect(row.createdById).toBe(users.staffA.id);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const find = await http()
        .get('/stock/find')
        .query({ q: '840 keyboard' })
        .set(authHeader('staffA', HALL))
        .expect(200);
      const hit = find.body.results.find((r: any) => r.productId === kb.productId);
      const hafeez = hit.branches.find((b: any) => b.branchId === HAFEEZ);
      expect(hafeez.reserved).toBe(1);
      expect(hafeez.available).toBe(2);
      expect(hit.totalAvailable).toBe(2);

      const listed = await http()
        .get('/reservations')
        .query({ status: 'ACTIVE' })
        .set(authHeader('staffA', HAFEEZ))
        .expect(200);
      expect(listed.body.items.map((r: any) => r.id)).toContain(res.body.id);

      const rel = await http()
        .post(`/reservations/${res.body.id}/release`)
        .set(authHeader('staffA', HAFEEZ));
      expect(rel.status).toBeLessThan(300);
      expect(rel.body.status).toBe('RELEASED');
      expect(await statusOf(res.body.instanceId)).toBe('AVAILABLE');
      expect(
        (await prisma.stockReservation.findUniqueOrThrow({ where: { id: res.body.id } })).status,
      ).toBe('RELEASED');

      const find2 = await http()
        .get('/stock/find')
        .query({ q: '840 keyboard' })
        .set(authHeader('staffA', HALL))
        .expect(200);
      const hafeez2 = find2.body.results
        .find((r: any) => r.productId === kb.productId)
        .branches.find((b: any) => b.branchId === HAFEEZ);
      expect(hafeez2.reserved).toBe(0);
      expect(hafeez2.available).toBe(3);
    });

    it('reserves a specific instance by instanceId and rejects a second reservation of it with 409', async () => {
      const target = kb.hafeezCentreInstanceIds[0];
      const first = await http()
        .post('/reservations')
        .set(authHeader('managerA', HAFEEZ))
        .send({ instanceId: target, customerName: 'T2 Direct' });
      if (first.body?.id) createdReservationIds.push(first.body.id);
      expect(first.status).toBe(201);
      expect(first.body.instanceId).toBe(target);
      expect(await statusOf(target)).toBe('RESERVED');

      const second = await http()
        .post('/reservations')
        .set(authHeader('managerA', HAFEEZ))
        .send({ instanceId: target, customerName: 'T2 Direct Again' });
      expect(second.status).toBe(409);
      expect(
        await prisma.stockReservation.count({ where: { instanceId: target, status: 'ACTIVE' } }),
      ).toBe(1);

      await http()
        .post(`/reservations/${first.body.id}/release`)
        .set(authHeader('managerA', HAFEEZ))
        .expect((r) => expect(r.status).toBeLessThan(300));
      expect(await statusOf(target)).toBe('AVAILABLE');
    });

    it('refuses to release a reservation twice (409) and leaves the unit AVAILABLE', async () => {
      const res = await reserveKeyboard('staffA');
      expect(res.status).toBe(201);
      await http().post(`/reservations/${res.body.id}/release`).set(authHeader('staffA', HAFEEZ));
      const again = await http()
        .post(`/reservations/${res.body.id}/release`)
        .set(authHeader('staffA', HAFEEZ));
      expect(again.status).toBe(409);
      expect(await statusOf(res.body.instanceId)).toBe('AVAILABLE');
    });

    it('rejects a reservation without a customer name (400) and changes nothing', async () => {
      const before = await prisma.productInstance.count({
        where: { productId: kb.productId, status: 'RESERVED' },
      });
      const res = await http()
        .post('/reservations')
        .set(authHeader('staffA', HAFEEZ))
        .send({ productId: kb.productId, branchId: HAFEEZ });
      expect(res.status).toBe(400);
      expect(
        await prisma.productInstance.count({ where: { productId: kb.productId, status: 'RESERVED' } }),
      ).toBe(before);
    });

    it('returns 409 when there is no available unit at the branch (Hall Road has no keyboards)', async () => {
      const res = await http()
        .post('/reservations')
        .set(authHeader('staffA', HALL))
        .send({ productId: kb.productId, branchId: HALL, customerName: 'T2 Nobody' });
      expect(res.status).toBe(409);
    });

    it('expires an overdue reservation: RELEASED and the unit is AVAILABLE again', async () => {
      const res = await reserveKeyboard('staffA', { hours: 1 });
      expect(res.status).toBe(201);
      const id: string = res.body.id;
      const instanceId: string = res.body.instanceId;
      const row = await prisma.stockReservation.findUniqueOrThrow({ where: { id } });
      // hours: 1 means roughly one hour from now
      const deltaMin = (row.expiresAt.getTime() - Date.now()) / 60000;
      expect(deltaMin).toBeGreaterThan(55);
      expect(deltaMin).toBeLessThan(61);
      expect(await statusOf(instanceId)).toBe('RESERVED');

      // Not yet due: the sweep must leave it alone.
      await app.get(ReservationsService).expireReservations();
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
      expect(await statusOf(instanceId)).toBe('RESERVED');

      await prisma.stockReservation.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const released = await app.get(ReservationsService).expireReservations();
      expect(released).toBeGreaterThanOrEqual(1);
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id } })).status).toBe('RELEASED');
      expect(await statusOf(instanceId)).toBe('AVAILABLE');
    });
  });

  describe('branch transfers', () => {
    it('request -> dispatch -> receive moves 2 units to Hall Road with movements and notifications', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 4, withCabinet: true });
      expect(stock.cabinetId).not.toBeNull();

      const reqRes = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 2, note: 'T2 flow' });
      expect(reqRes.status).toBe(201);
      expect(reqRes.body.status).toBe('REQUESTED');
      expect(reqRes.body.fromBranch.id).toBe(HAFEEZ);
      expect(reqRes.body.toBranch.id).toBe(HALL);
      const id: string = reqRes.body.id;

      const row = await prisma.stockTransferRequest.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      expect(row.status).toBe('REQUESTED');
      expect(row.businessId).toBe(tenants.A.id);
      expect(row.requestedById).toBe(users.staffA.id);
      expect(row.items).toHaveLength(2);
      // Request time does not lock stock.
      expect(
        await prisma.productInstance.count({ where: { productId: stock.product.id, status: 'AVAILABLE' } }),
      ).toBe(4);

      // owner/manager of tenant A are notified
      const notes = await prisma.notification.findMany({
        where: { entityId: id, type: 'transfer.requested' },
        include: { user: true },
      });
      expect(notes.length).toBeGreaterThanOrEqual(1);
      for (const n of notes) {
        expect(n.businessId).toBe(tenants.A.id);
        expect(['OWNER', 'MANAGER']).toContain(n.user.role);
        expect(n.entityType).toBe('TRANSFER');
      }
      expect(notes.map((n) => n.userId)).not.toContain(users.staffA.id);

      // staff cannot dispatch; nothing changes
      await http().post(`/stock-transfers/${id}/dispatch`).set(authHeader('staffA', HAFEEZ)).expect(403);
      expect((await prisma.stockTransferRequest.findUniqueOrThrow({ where: { id } })).status).toBe('REQUESTED');
      expect(
        await prisma.productInstance.count({ where: { productId: stock.product.id, status: 'IN_TRANSIT' } }),
      ).toBe(0);

      // receive before dispatch is refused
      await http().post(`/stock-transfers/${id}/receive`).set(authHeader('managerA', HALL)).expect(409);

      const disp = await http().post(`/stock-transfers/${id}/dispatch`).set(authHeader('managerA', HAFEEZ));
      expect(disp.status).toBeLessThan(300);
      expect(disp.body.status).toBe('DISPATCHED');
      const itemIds = row.items.map((i) => i.instanceId);
      const inTransit = await prisma.productInstance.findMany({ where: { id: { in: itemIds } } });
      expect(inTransit.map((i) => i.status)).toEqual(['IN_TRANSIT', 'IN_TRANSIT']);
      expect(inTransit.every((i) => i.branchId === HAFEEZ)).toBe(true);
      expect(
        await prisma.productInstance.count({ where: { productId: stock.product.id, status: 'AVAILABLE' } }),
      ).toBe(2);

      const outs = await prisma.inventoryMovement.findMany({
        where: { referenceType: 'TRANSFER', referenceId: id, direction: 'OUT' },
      });
      expect(outs.length).toBeGreaterThanOrEqual(1);
      expect(outs.reduce((s, m) => s + m.quantity, 0)).toBe(2);
      for (const m of outs) {
        expect(m.branchId).toBe(HAFEEZ);
        expect(m.productId).toBe(stock.product.id);
        expect(m.businessId).toBe(tenants.A.id);
      }
      expect(await prisma.notification.count({ where: { entityId: id, type: 'transfer.dispatched' } })).toBeGreaterThanOrEqual(1);

      // dispatching again is refused
      await http().post(`/stock-transfers/${id}/dispatch`).set(authHeader('managerA', HAFEEZ)).expect(409);

      // staff cannot receive
      await http().post(`/stock-transfers/${id}/receive`).set(authHeader('staffA', HALL)).expect(403);

      const recv = await http().post(`/stock-transfers/${id}/receive`).set(authHeader('managerA', HALL));
      expect(recv.status).toBeLessThan(300);
      expect(recv.body.status).toBe('RECEIVED');
      const arrived = await prisma.productInstance.findMany({ where: { id: { in: itemIds } } });
      for (const i of arrived) {
        expect(i.status).toBe('AVAILABLE');
        expect(i.branchId).toBe(HALL);
        expect(i.cabinetId).toBeNull();
      }
      const ins = await prisma.inventoryMovement.findMany({
        where: { referenceType: 'TRANSFER', referenceId: id, direction: 'IN' },
      });
      expect(ins.reduce((s, m) => s + m.quantity, 0)).toBe(2);
      for (const m of ins) expect(m.branchId).toBe(HALL);
      expect((await prisma.stockTransferRequest.findUniqueOrThrow({ where: { id } })).status).toBe('RECEIVED');

      // per-branch totals
      expect(
        await prisma.productInstance.count({
          where: { productId: stock.product.id, branchId: HALL, status: 'AVAILABLE' },
        }),
      ).toBe(2);
      expect(
        await prisma.productInstance.count({
          where: { productId: stock.product.id, branchId: HAFEEZ, status: 'AVAILABLE' },
        }),
      ).toBe(2);

      // cannot cancel after receipt
      await http().post(`/stock-transfers/${id}/cancel`).set(authHeader('managerA', HALL)).expect(409);

      // visible via GET :id and the list filters
      const got = await http().get(`/stock-transfers/${id}`).set(authHeader('staffA', HALL)).expect(200);
      expect(got.body.status).toBe('RECEIVED');
      expect(got.body.lines).toEqual([
        expect.objectContaining({ productId: stock.product.id, quantity: 2 }),
      ]);
      const incoming = await http()
        .get('/stock-transfers')
        .query({ direction: 'incoming' })
        .set(authHeader('staffA', HALL))
        .expect(200);
      expect(incoming.body.items.map((t: any) => t.id)).toContain(id);
      const outgoingFromHall = await http()
        .get('/stock-transfers')
        .query({ direction: 'outgoing' })
        .set(authHeader('staffA', HALL))
        .expect(200);
      expect(outgoingFromHall.body.items.map((t: any) => t.id)).not.toContain(id);
      const outgoingFromHafeez = await http()
        .get('/stock-transfers')
        .query({ direction: 'outgoing' })
        .set(authHeader('ownerA', HAFEEZ))
        .expect(200);
      expect(outgoingFromHafeez.body.items.map((t: any) => t.id)).toContain(id);
    });

    it('rejects a quantity larger than the stock with 409 and creates nothing', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 2 });
      const before = await prisma.stockTransferRequest.count({ where: { businessId: tenants.A.id } });
      const res = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 10 });
      expect(res.status).toBe(409);
      expect(await prisma.stockTransferRequest.count({ where: { businessId: tenants.A.id } })).toBe(before);
    });

    it('rejects an absurd quantity (99, above the DTO cap of 50) with 400 and creates nothing', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 2 });
      const before = await prisma.stockTransferRequest.count({ where: { businessId: tenants.A.id } });
      const res = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 99 });
      expect(res.status).toBe(400);
      expect(await prisma.stockTransferRequest.count({ where: { businessId: tenants.A.id } })).toBe(before);
    });

    it('rejects a transfer from the own branch (400)', async () => {
      const stock = await makeStock({ branchId: HALL, count: 1 });
      const res = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HALL, productId: stock.product.id, quantity: 1 });
      expect(res.status).toBe(400);
    });

    it('lets a REQUESTED transfer be cancelled by staff without touching stock', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 2 });
      const reqRes = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 1 });
      expect(reqRes.status).toBe(201);
      const id = reqRes.body.id;

      const cancel = await http().post(`/stock-transfers/${id}/cancel`).set(authHeader('staffA', HALL));
      expect(cancel.status).toBeLessThan(300);
      expect(cancel.body.status).toBe('CANCELLED');
      const row = await prisma.stockTransferRequest.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelledAt).not.toBeNull();
      expect(
        await prisma.productInstance.count({
          where: { productId: stock.product.id, branchId: HAFEEZ, status: 'AVAILABLE' },
        }),
      ).toBe(2);
      expect(await prisma.inventoryMovement.count({ where: { referenceId: id } })).toBe(0);

      // cannot dispatch a cancelled transfer
      await http().post(`/stock-transfers/${id}/dispatch`).set(authHeader('managerA', HAFEEZ)).expect(409);
    });

    it('lets only a manager/owner cancel a DISPATCHED transfer, returning units to the source with movements', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 2 });
      const reqRes = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 2 });
      expect(reqRes.status).toBe(201);
      const id = reqRes.body.id;
      await http().post(`/stock-transfers/${id}/dispatch`).set(authHeader('ownerA', HAFEEZ)).expect((r) => expect(r.status).toBeLessThan(300));

      await http().post(`/stock-transfers/${id}/cancel`).set(authHeader('staffA', HALL)).expect(403);
      expect((await prisma.stockTransferRequest.findUniqueOrThrow({ where: { id } })).status).toBe('DISPATCHED');

      const cancel = await http().post(`/stock-transfers/${id}/cancel`).set(authHeader('managerA', HAFEEZ));
      expect(cancel.status).toBeLessThan(300);
      expect(cancel.body.status).toBe('CANCELLED');
      const insts = await prisma.productInstance.findMany({ where: { productId: stock.product.id } });
      expect(insts.every((i) => i.status === 'AVAILABLE' && i.branchId === HAFEEZ)).toBe(true);
      const back = await prisma.inventoryMovement.findMany({
        where: { referenceId: id, referenceType: 'TRANSFER_CANCEL', direction: 'IN' },
      });
      expect(back.reduce((s, m) => s + m.quantity, 0)).toBe(2);
    });
  });

  describe('tenant isolation on :id routes', () => {
    it('hides tenant A transfers and reservations from tenant B (404) and changes nothing', async () => {
      const stock = await makeStock({ branchId: HAFEEZ, count: 2 });
      const tr = await http()
        .post('/stock-transfers')
        .set(authHeader('staffA', HALL))
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 1 });
      expect(tr.status).toBe(201);
      const transferId = tr.body.id;

      const rsv = await reserveKeyboard('staffA');
      expect(rsv.status).toBe(201);
      const reservationId = rsv.body.id;
      const reservedInstance = rsv.body.instanceId;

      const bHeaders = authHeader('ownerB', B_BRANCH);
      await http().get(`/stock-transfers/${transferId}`).set(bHeaders).expect(404);
      await http().post(`/stock-transfers/${transferId}/dispatch`).set(bHeaders).expect(404);
      await http().post(`/stock-transfers/${transferId}/receive`).set(bHeaders).expect(404);
      await http().post(`/stock-transfers/${transferId}/cancel`).set(bHeaders).expect(404);
      await http().post(`/reservations/${reservationId}/release`).set(bHeaders).expect(404);

      expect((await prisma.stockTransferRequest.findUniqueOrThrow({ where: { id: transferId } })).status).toBe('REQUESTED');
      expect(
        (await prisma.stockReservation.findUniqueOrThrow({ where: { id: reservationId } })).status,
      ).toBe('ACTIVE');
      expect(await statusOf(reservedInstance)).toBe('RESERVED');

      // B cannot see them in lists either
      const listT = await http().get('/stock-transfers').set(bHeaders).expect(200);
      expect(listT.body.items.map((t: any) => t.id)).not.toContain(transferId);
      const listR = await http().get('/reservations').set(bHeaders).expect(200);
      expect(listR.body.items.map((r: any) => r.id)).not.toContain(reservationId);

      // B cannot reserve A's instance or request a transfer from A's branch
      const steal = await http()
        .post('/reservations')
        .set(bHeaders)
        .send({ instanceId: kb.hafeezCentreInstanceIds[1], customerName: 'Thief' });
      expect(steal.status).toBe(404);
      const xfer = await http()
        .post('/stock-transfers')
        .set(bHeaders)
        .send({ fromBranchId: HAFEEZ, productId: stock.product.id, quantity: 1 });
      expect(xfer.status).toBe(404);

      // cleanup the reservation (owner of A)
      await http().post(`/reservations/${reservationId}/release`).set(authHeader('ownerA', HAFEEZ)).expect((r) => expect(r.status).toBeLessThan(300));
      expect(await statusOf(reservedInstance)).toBe('AVAILABLE');
    });
  });
});
