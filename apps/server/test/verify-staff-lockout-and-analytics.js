const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = 'hellosecretaccesstoken1122';
const API_URL = 'http://localhost:5000';

async function runVerification() {
  console.log('=== STARTING SECURITY & ANALYTICS VERIFICATION ===\n');

  try {
    // 1. Find or pick Owner & Staff accounts
    let owner = await prisma.user.findFirst({
      where: { role: 'OWNER' },
      include: { business: true },
    });

    let staff = await prisma.user.findFirst({
      where: { role: 'STAFF' },
    });

    if (!staff && owner) {
      staff = await prisma.user.create({
        data: {
          name: 'Staff Test User',
          email: `staff_test_${Date.now()}@example.com`,
          password: 'hashedpassword',
          role: 'STAFF',
          businessId: owner.businessId,
        },
      });
      console.log('Created temporary staff test user:', staff.email);
    }

    if (!owner || !staff) {
      throw new Error('Could not find or create test users in database');
    }

    const ownerToken = jwt.sign(
      { id: owner.id, email: owner.email, role: owner.role, businessId: owner.businessId, name: owner.name },
      JWT_SECRET,
      { expiresIn: '1h' },
    );

    const staffToken = jwt.sign(
      { id: staff.id, email: staff.email, role: staff.role, businessId: staff.businessId, name: staff.name },
      JWT_SECRET,
      { expiresIn: '1h' },
    );

    console.log(`Testing with:\n- Owner: ${owner.email} (${owner.role})\n- Staff: ${staff.email} (${staff.role})\n`);

    // ==========================================
    // TEST 1: STAFF ATTEMPTS TO ACCESS REPORTS (ANALYTICS)
    // ==========================================
    console.log('--- TEST 1: Staff accessing /reports/financial ---');
    const reportsRes = await fetch(`${API_URL}/reports/financial`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`Status: ${reportsRes.status} (Expected: 403)`);
    const reportsBody = await reportsRes.json();
    console.log('Response:', reportsBody);
    if (reportsRes.status !== 403) {
      throw new Error(`FAIL: Staff was not blocked from /reports/financial! Status: ${reportsRes.status}`);
    }
    console.log('PASS: Staff is strictly blocked with 403 from Reports/Analytics.\n');

    // ==========================================
    // TEST 2: STAFF ATTEMPTS TO ACCESS SETTINGS
    // ==========================================
    console.log('--- TEST 2: Staff accessing /settings/profileinfo ---');
    const settingsRes = await fetch(`${API_URL}/settings/profileinfo`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`Status: ${settingsRes.status} (Expected: 403)`);
    const settingsBody = await settingsRes.json();
    console.log('Response:', settingsBody);
    if (settingsRes.status !== 403) {
      throw new Error(`FAIL: Staff was not blocked from /settings/profileinfo! Status: ${settingsRes.status}`);
    }
    console.log('PASS: Staff is strictly blocked with 403 from Settings.\n');

    // ==========================================
    // TEST 3: STAFF ATTEMPTS DELETE CATEGORY / CABINET
    // ==========================================
    console.log('--- TEST 3: Staff accessing /product/category/:id/delete ---');
    const deleteRes = await fetch(`${API_URL}/product/category/test-id/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`Status: ${deleteRes.status} (Expected: 403)`);
    if (deleteRes.status !== 403) {
      throw new Error(`FAIL: Staff was not blocked from delete category! Status: ${deleteRes.status}`);
    }
    console.log('PASS: Staff is strictly blocked with 403 from delete endpoints.\n');

    // ==========================================
    // TEST 4: OWNER ACCESSING DASHBOARD AGGREGATES & PROFIT MARGINS
    // ==========================================
    console.log('--- TEST 4: Owner accessing /dashboard/dashboarddata ---');
    const ownerDashRes = await fetch(`${API_URL}/dashboard/dashboarddata`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    console.log(`Status: ${ownerDashRes.status} (Expected: 200)`);
    const ownerDash = await ownerDashRes.json();
    console.log('Owner Dashboard KPIs:', ownerDash.kpis);

    if (!ownerDash.success || !ownerDash.kpis) {
      throw new Error('FAIL: Owner could not fetch dashboard data');
    }

    const { dailyGrossSales, dailyCOGS, dailyExpenses, netProfit, profitMargin, pendingUdhar } = ownerDash.kpis;
    console.log(`\nVerified Calculations:`);
    console.log(`- Daily Gross Sales: Rs. ${dailyGrossSales}`);
    console.log(`- Daily COGS: Rs. ${dailyCOGS}`);
    console.log(`- Daily Expenses: Rs. ${dailyExpenses}`);
    console.log(`- Net Profit: Rs. ${netProfit}`);
    console.log(`- Profit Margin: ${profitMargin}%`);
    console.log(`- Pending Customer Udhar: Rs. ${pendingUdhar}`);

    const expectedNetProfit = dailyGrossSales - dailyCOGS - dailyExpenses;
    if (netProfit !== expectedNetProfit) {
      throw new Error(`FAIL: Net profit formula mismatch! Got ${netProfit}, expected ${expectedNetProfit}`);
    }
    console.log('PASS: Net Profit = Gross Revenue - COGS - Expenses exactly verified.\n');

    // ==========================================
    // TEST 5: STAFF ACCESSING DASHBOARD HAS SENSITIVE PROFIT MARGINS MASKED
    // ==========================================
    console.log('--- TEST 5: Staff accessing /dashboard/dashboarddata ---');
    const staffDashRes = await fetch(`${API_URL}/dashboard/dashboarddata`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`Status: ${staffDashRes.status} (Expected: 200)`);
    const staffDash = await staffDashRes.json();
    console.log('Staff Dashboard KPIs:', staffDash.kpis);

    if (staffDash.kpis.netProfit !== null || staffDash.kpis.dailyCOGS !== null) {
      throw new Error('FAIL: Staff was able to see confidential owner net profit and COGS!');
    }
    console.log('PASS: Staff cannot see confidential owner net profit or COGS (masked as null).\n');

    console.log('=== ALL SECURITY & ANALYTICS VERIFICATIONS PASSED ===');
  } finally {
    await prisma.$disconnect();
  }
}

runVerification().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
