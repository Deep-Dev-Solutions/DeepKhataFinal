import fetch from 'node-fetch';

async function test() {
  const loginRes = await fetch('http://localhost:5000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hafeez@deepkhata.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  console.log("Token:", token ? "Got token" : "Failed to get token", loginData);

  if (token) {
    const res = await fetch('http://localhost:5000/order/fake-id/settle-memo', {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ amountPaid: 100 })
    });
    console.log("Settle Memo Response:", res.status, await res.text());
  }
}
test();
