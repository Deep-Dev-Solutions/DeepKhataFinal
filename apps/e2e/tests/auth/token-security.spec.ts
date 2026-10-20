import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { users, tenants } from '../../fixtures/users';
import { apiAs } from '../../helpers/api';
import { E2E } from '../../env';

const OLD_SECRET = 'hellosecretaccesstoken1122';
const PROTECTED = `${E2E.apiUrl}/customer/getallcustomers`;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

const payload = {
  id: users.ownerA.id,
  role: 'OWNER',
  businessId: tenants.A.id,
  email: users.ownerA.email,
};

test.describe('A: forged and malformed tokens are rejected', () => {
  test('token signed with the old leaked secret -> 401', async ({ request }) => {
    const forged = jwt.sign(payload, OLD_SECRET, { expiresIn: '1h', jwtid: 'forged-1' });
    const res = await request.get(PROTECTED, { headers: { Authorization: `Bearer ${forged}` } });
    expect(res.status()).toBe(401);
  });

  test('old-secret token via hand-rolled HMAC-SHA256 -> 401', async ({ request }) => {
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
    const sig = crypto.createHmac('sha256', OLD_SECRET).update(`${head}.${body}`).digest('base64url');
    const res = await request.get(PROTECTED, { headers: { Authorization: `Bearer ${head}.${body}.${sig}` } });
    expect(res.status()).toBe(401);
  });

  test('alg=none token -> 401', async ({ request }) => {
    const head = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }));
    const res = await request.get(PROTECTED, { headers: { Authorization: `Bearer ${head}.${body}.` } });
    expect(res.status()).toBe(401);
  });

  test('valid token with tampered payload (role escalation) -> 401', async ({ request }) => {
    const api = await apiAs('staffA', request);
    // The untampered staff token is valid but lacks read:reports -> 403 (proves the 401 below is the signature check).
    expect((await api.get('/reports/financial')).status()).toBe(403);
    const login = await request.post(`${E2E.apiUrl}/auth/login`, {
      data: { email: users.staffA.email, password: 'DeepKhata#Test1' },
    });
    const { accessToken } = await login.json();
    const tampered = accessToken.includes('.')
      ? (() => {
          const [h, p, s] = accessToken.split('.');
          const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
          claims.role = 'OWNER';
          return `${h}.${b64url(JSON.stringify(claims))}.${s}`;
        })()
      : `${accessToken}-tampered`;
    const res = await request.get(`${E2E.apiUrl}/reports/financial`, { headers: { Authorization: `Bearer ${tampered}` } });
    expect(res.status()).toBe(401);
  });

  test('missing and garbage tokens -> 401', async ({ request }) => {
    expect((await request.get(PROTECTED)).status()).toBe(401);
    expect((await request.get(PROTECTED, { headers: { Authorization: 'Bearer not.a.jwt' } })).status()).toBe(401);
  });
});
