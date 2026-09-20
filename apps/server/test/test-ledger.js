const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  console.log('Creating Business & User...');
  // ... directly inserting into DB for speed to test Ledger!

  const business = await prisma.business.create({
    data: {
      name: 'Test Repair Shop',
      slug: 'test-repair-' + Date.now(),
      ownerId: 'temp',
    },
  });

  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: 'test' + Date.now() + '@example.com',
      password: '123',
      businessId: business.id,
      role: 'OWNER',
    },
  });

  await prisma.business.update({
    where: { id: business.id },
    data: { ownerId: user.id },
  });

  const customer = await prisma.customer.create({
    data: {
      name: 'John Doe',
      phone: '0000000000',
      businessId: business.id,
    },
  });

  const cabinet = await prisma.cabinet.create({
    data: {
      name: 'Rack 1 - Bin A',
      businessId: business.id,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: 'iPhone X Display',
      price: 15000,
      stock: 5,
      businessId: business.id,
    },
  });

  // Create 5 instances
  await prisma.productInstance.createMany({
    data: Array(5)
      .fill(0)
      .map(() => ({
        productId: product.id,
        cabinetId: cabinet.id,
        status: 'AVAILABLE',
      })),
  });

  console.log('Mock setup complete. Sending MEMO order via server API...');

  // Actually, wait, doing it via API requires auth. I will just call the service directly to test logic.
  const { OrdersService } = require('../src/orders/orders.service.js');
  const { LedgerService } = require('../src/ledger/ledger.service.js');

  const ledgerService = new LedgerService(prisma);
  const ordersService = new OrdersService(prisma, ledgerService);

  console.log('Creating MEMO order...');
  const memoOrder = await ordersService.newOrder(user.id, {
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 2, price: 15000 }],
    amountPaid: 0,
    orderStatus: 'MEMO',
  });

  console.log('MEMO Order created:', memoOrder.order.id);

  // Verify physical stock
  const pAfterMemo = await prisma.product.findUnique({
    where: { id: product.id },
  });
  console.log('Product stock after MEMO (expected 3):', pAfterMemo.stock);

  const memoInstances = await prisma.productInstance.findMany({
    where: { productId: product.id, status: 'MEMO_LOCKED' },
  });
  console.log('MEMO locked instances (expected 2):', memoInstances.length);

  const tx1 = await prisma.transaction.findMany({
    where: { referenceId: memoOrder.order.id },
  });
  console.log('Ledger Transactions for MEMO (expected 0):', tx1.length);

  console.log('Converting MEMO to FINAL...');
  await ordersService.updateOrderStatus(user.id, memoOrder.order.id, {
    status: 'FINAL',
  });

  const finalInstances = await prisma.productInstance.findMany({
    where: { productId: product.id, status: 'SOLD' },
  });
  console.log(
    'SOLD instances after FINAL (expected 2):',
    finalInstances.length,
  );

  const tx2 = await prisma.transaction.findMany({
    where: { referenceId: memoOrder.order.id },
    include: { postings: true },
  });
  console.log('Ledger Transactions for FINAL (expected 1):', tx2.length);
  if (tx2.length > 0) {
    console.log('Postings:');
    tx2[0].postings.forEach((p) =>
      console.log(
        `  Account: ${p.accountType} (${p.accountId}) | Amount: ${p.amount}`,
      ),
    );
  }

  // Create a new FINAL order directly
  console.log('Creating direct FINAL order...');
  const finalOrder = await ordersService.newOrder(user.id, {
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1, price: 15000 }],
    amountPaid: 15000,
    orderStatus: 'FINAL',
  });

  const tx3 = await prisma.transaction.findMany({
    where: { referenceId: finalOrder.order.id },
    include: { postings: true },
  });
  console.log('Ledger Transactions for direct FINAL:');
  if (tx3.length > 0) {
    console.log('Postings:');
    tx3[0].postings.forEach((p) =>
      console.log(
        `  Account: ${p.accountType} (${p.accountId}) | Amount: ${p.amount}`,
      ),
    );
  }

  console.log('Mathematical verification complete.');
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
