const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Manually simulate service logic or call service directly
const { LedgerService } = require('../dist/ledger/ledger.service');
const { CashService } = require('../dist/cash/cash.service');

async function runExpenseLedgerTest() {
  console.log('--- STARTING EXPENSE & DOUBLE-ENTRY LEDGER TEST ---');

  const ledgerService = new LedgerService(prisma);
  const cashService = new CashService(prisma, ledgerService);

  // 1. Setup Test Business & User
  const user = await prisma.user.create({
    data: {
      name: 'Counter Staff',
      email: 'staff' + Date.now() + '@example.com',
      password: 'password123',
      role: 'STAFF',
    },
  });

  const business = await prisma.business.create({
    data: {
      name: 'Hafeez Centre Mobile Care',
      slug: 'hafeez-care-' + Date.now(),
      ownerId: user.id,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { businessId: business.id },
  });

  console.log(`✓ Setup Business [${business.id}] and User [${user.id}]`);

  // 2. Open Cash Drawer with 2,000 PKR opening float
  console.log('\n--- Step 2: Opening Register Session ---');
  const openResult = await cashService.openRegister(user.id, {
    openingBalance: 2000,
    notes: 'Morning shift opening float',
  });
  console.log(`✓ Register session opened: ID=${openResult.session.id}, Float=PKR ${openResult.session.openingBalance}`);

  // 3. Log an operational cash expense: 500 PKR for Chai
  console.log('\n--- Step 3: Logging 500 PKR Cash Expense for Chai ---');
  const chaiResult = await cashService.logExpense(user.id, {
    amount: 500,
    category: 'CHAI_REFRESHMENT',
    description: 'Butt Tea Stall 5 teas for shop guests',
  });
  console.log(`✓ Expense logged: ID=${chaiResult.expense.id}, Amount=${chaiResult.expense.amount}`);

  // 4. Verify Double-Entry Balance for Chai Expense
  console.log('\n--- Step 4: Mathematical Verification of Ledger Balance ---');
  const chaiTx = await prisma.transaction.findUnique({
    where: { id: chaiResult.expense.transactionId },
    include: { postings: true },
  });

  if (!chaiTx) {
    throw new Error('FAILED: Ledger transaction not found for expense!');
  }

  console.log(`Transaction ID: ${chaiTx.id}, Type: ${chaiTx.type}, ReferenceId: ${chaiTx.referenceId}`);
  console.log('Postings:');
  let sum = 0;
  chaiTx.postings.forEach((p) => {
    console.log(`  [Posting] AccountType: ${p.accountType.padEnd(8)} | AccountId: ${p.accountId.padEnd(16)} | Amount: ${p.amount}`);
    sum += p.amount;
  });

  if (Math.abs(sum) > 0.0001) {
    throw new Error(`FAILED: Ledger transaction postings do not balance to zero! Sum = ${sum}`);
  }
  console.log(`✓ Total postings sum = ${sum} (Debits + Credits = 0. EXACTLY BALANCED!)`);

  const expensePosting = chaiTx.postings.find((p) => p.accountType === 'EXPENSE');
  const cashPosting = chaiTx.postings.find((p) => p.accountId === 'CASH');

  if (!expensePosting || expensePosting.amount !== 500) {
    throw new Error(`FAILED: Expense posting debit expected 500, got ${expensePosting?.amount}`);
  }
  if (!cashPosting || cashPosting.amount !== -500) {
    throw new Error(`FAILED: Cash posting credit expected -500, got ${cashPosting?.amount}`);
  }
  console.log('✓ Verified: Debit EXPENSE (+500), Credit CASH (-500).');

  // 5. Log a second expense: 350 PKR for Delivery Rider
  console.log('\n--- Step 5: Logging Second Expense (350 PKR for Delivery) ---');
  const riderResult = await cashService.logExpense(user.id, {
    amount: 350,
    category: 'DELIVERY_RIDER',
    description: 'Bykea rider parcel delivery to Hall Road',
  });
  console.log(`✓ Expense logged: ID=${riderResult.expense.id}, Amount=${riderResult.expense.amount}`);

  // 6. Check Register Status & Expected Cash
  console.log('\n--- Step 6: Checking Register Status & Expected Cash Calculation ---');
  const status = await cashService.getRegisterStatus(user.id);
  console.log(`  Opening Balance:  PKR ${status.openingBalance}`);
  console.log(`  Cash Sales (+):   PKR ${status.cashSales}`);
  console.log(`  Cash Expenses (-):PKR ${status.cashExpenses}`);
  console.log(`  Expected in Drawer: PKR ${status.expectedCash}`);

  const expectedCalculated = 2000 + 0 - (500 + 350); // 1150
  if (status.expectedCash !== expectedCalculated) {
    throw new Error(`FAILED: Expected cash mismatch! Expected ${expectedCalculated}, got ${status.expectedCash}`);
  }
  console.log(`✓ Expected cash correctly calculated: PKR ${status.expectedCash}`);

  // 7. Close Register with Counted Cash (1100 PKR -> Shortage of 50 PKR)
  console.log('\n--- Step 7: Closing Register with Physical Count of 1,100 PKR (Shortage of 50) ---');
  const closeResult = await cashService.closeRegister(user.id, {
    actualCash: 1100,
    notes: 'Short by 50 PKR due to small coin shortage during change return',
  });

  console.log(`  Actual Counted Cash: PKR ${closeResult.reconciliation.actualCash}`);
  console.log(`  Expected Cash:       PKR ${closeResult.reconciliation.expectedCash}`);
  console.log(`  Difference:          PKR ${closeResult.reconciliation.difference}`);
  console.log(`  Discrepancy Type:    ${closeResult.reconciliation.discrepancyType}`);

  if (closeResult.reconciliation.difference !== -50 || closeResult.reconciliation.discrepancyType !== 'SHORTAGE') {
    throw new Error(`FAILED: Reconciliation discrepancy mismatch! Got ${closeResult.reconciliation.difference}`);
  }
  console.log('✓ Register successfully reconciled and closed with correct shortage flagged.');

  // 8. Generate Z-Report
  console.log('\n--- Step 8: Generating End of Day Z-Report ---');
  const zReport = await cashService.getZReport(user.id, closeResult.session.id);
  console.log('Z-Report Summary:', JSON.stringify(zReport.report.summary, null, 2));
  console.log('Expenses by Category:', JSON.stringify(zReport.report.expensesByCategory, null, 2));
  console.log('Total Expenses Count:', zReport.report.expensesCount);

  if (zReport.report.expensesCount !== 2) {
    throw new Error(`FAILED: Z-Report expected 2 expenses, got ${zReport.report.expensesCount}`);
  }
  console.log('✓ Z-Report generated with itemized categories and complete audit trail.');

  console.log('\n========================================');
  console.log('🎉 ALL EXPENSE & LEDGER RECONCILIATION TESTS PASSED!');
  console.log('========================================\n');
}

runExpenseLedgerTest()
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
