async function runMaskedIpTest() {
  const MASKED_IP = '198.51.100.77';
  const BASE_URL = 'http://localhost:5000';

  console.log('====================================================');
  console.log(
    '1. TESTING 10-ATTEMPT BRUTE-FORCE LOCKOUT WITH MASKED IP:',
    MASKED_IP,
  );
  console.log('====================================================');

  for (let i = 1; i <= 10; i++) {
    const res = await fetch(`${BASE_URL}/auth/agency-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': MASKED_IP,
      },
      body: JSON.stringify({
        email: 'attacker_target@deepkhata.com',
        password: `wrong_pass_${i}`,
      }),
    });

    const data = await res.json();
    console.log(`Attempt ${i} -> HTTP ${res.status}:`, data.message || data);
  }

  console.log('\n====================================================');
  console.log('2. TESTING ATTEMPT 11 (SHOULD BE REJECTED BY ACTIVE LOCKOUT)');
  console.log('====================================================');

  const lockedRes = await fetch(`${BASE_URL}/auth/agency-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': MASKED_IP,
    },
    body: JSON.stringify({
      email: 'attacker_target@deepkhata.com',
      password: 'any_password',
    }),
  });
  const lockedData = await lockedRes.json();
  console.log(
    `Blocked Attempt -> HTTP ${lockedRes.status}:`,
    lockedData.message || lockedData,
  );

  console.log('\n====================================================');
  console.log('3. TESTING NEW SEEDED SUPER ADMIN LOGIN WITH CLEAN IP');
  console.log('====================================================');

  const adminRes = await fetch(`${BASE_URL}/auth/agency-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.99',
    },
    body: JSON.stringify({
      email: 'deepdevsolutions1@gmail.com',
      password: 'Deep@DevSol88*',
    }),
  });

  const adminData = await adminRes.json();
  console.log(`Admin Login -> HTTP ${adminRes.status}`);
  console.log('User Name:', adminData.user?.name);
  console.log('User Email:', adminData.user?.email);
  console.log('User Role:', adminData.user?.role);
  console.log('JWT Access Token Received:', Boolean(adminData.accessToken));

  console.log('\n====================================================');
  console.log('4. TESTING NON-SUPER-ADMIN ATTEMPTING AGENCY LOGIN');
  console.log('====================================================');

  const nonAdminRes = await fetch(`${BASE_URL}/auth/agency-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.100',
    },
    body: JSON.stringify({
      email: 'hafeez@deepkhata.com', // regular shop owner
      password: 'password123',
    }),
  });

  const nonAdminData = await nonAdminRes.json();
  console.log(
    `Non-Admin on Agency Portal -> HTTP ${nonAdminRes.status}:`,
    nonAdminData.message || nonAdminData,
  );

  console.log('\n====================================================');
  console.log('ALL TESTS EXECUTED SUCCESSFULLY');
  console.log('====================================================');
}

runMaskedIpTest().catch(console.error);
