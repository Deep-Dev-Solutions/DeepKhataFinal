// Login storm: 100 -> 300 VUs logging in through the real endpoint (POST /auth/login on the Nest
// AuthController, which calls Better Auth signInEmail; the Better Auth route
// POST /api/auth/sign-in/email is the same code path and is selectable with -e LOGIN_PATH).
//   k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/login-storm.js
// Optional: -e LOGIN_PATH=/api/auth/sign-in/email  -e HOLD=1m
//
// Only VALID credentials are sent: 10 failed attempts per IP or per account lock both for 3 h
// (apps/server/src/auth/lockout.ts), which would poison the staging users. Expected statuses are
// 200 and 429 (throttler / lockout). 429s are counted in `login_rate_limited`, not as failures.
// Anything 5xx (or 401 for a valid password) fails the run.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, loadUsers, xff, thinkTime } from './lib/common.js';

const LOGIN_PATH = __ENV.LOGIN_PATH || '/auth/login';
const HOLD = __ENV.HOLD || '1m';

const loginOk = new Counter('login_ok');
const loginRateLimited = new Counter('login_rate_limited'); // HTTP 429
const loginUnauthorized = new Counter('login_unauthorized'); // 401 with valid creds = wrong seed
const login5xx = new Counter('login_5xx');
const loginServerError = new Rate('login_server_error_rate');
const loginDuration = new Trend('login_duration', true); // successful (200) logins only

export const options = {
  scenarios: {
    storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: HOLD, target: 100 },
        { duration: '1m', target: 300 },
        { duration: HOLD, target: 300 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // 429 is expected under a storm, so it is excluded via the per-request responseCallback below.
    http_req_failed: ['rate<0.01'],
    login_duration: ['p(95)<1500'], // password hash cost dominates
    login_5xx: ['count==0'],
    login_server_error_rate: ['rate==0'],
    login_unauthorized: ['count==0'],
    login_ok: ['count>0'], // a run where everything was 429 proves nothing
    checks: ['rate>0.99'],
  },
};

const expected = http.expectedStatuses({ min: 200, max: 299 }, 429);

export function setup() {
  const users = loadUsers();
  // Smoke check before the storm so a bad seed fails fast with a clear message.
  const r = http.post(
    `${BASE_URL}${LOGIN_PATH}`,
    JSON.stringify({ email: users[0].email, password: users[0].password }),
    { headers: { 'content-type': 'application/json', ...xff(0, 0, 11) } },
  );
  if (r.status !== 200) {
    throw new Error(`pre-flight login failed: HTTP ${r.status} ${String(r.body).slice(0, 200)}`);
  }
  return { users };
}

export default function (data) {
  const u = data.users[(__VU + __ITER) % data.users.length];
  const res = http.post(
    `${BASE_URL}${LOGIN_PATH}`,
    JSON.stringify({ email: u.email, password: u.password }),
    {
      headers: { 'content-type': 'application/json', ...xff(__VU, __ITER) },
      tags: { name: 'login' },
      responseCallback: expected,
    },
  );

  const is5xx = res.status >= 500;
  loginServerError.add(is5xx);
  if (is5xx) login5xx.add(1);
  if (res.status === 429) loginRateLimited.add(1);
  if (res.status === 401) loginUnauthorized.add(1);
  if (res.status === 200) {
    loginOk.add(1);
    loginDuration.add(res.timings.duration);
  }

  check(res, {
    'status is 200 or 429 (never 5xx)': (r) => r.status === 200 || r.status === 429,
    'successful login returns a token': (r) =>
      r.status !== 200 || !!(r.json('accessToken') || r.json('token')),
  });

  thinkTime(1, 3);
}
