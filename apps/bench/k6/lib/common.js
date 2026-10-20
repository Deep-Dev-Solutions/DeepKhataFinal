// Shared helpers for the DeepKhata k6 scenarios. STAGING ONLY, see ../README.md.
//
// Env vars (all passed with `k6 run -e NAME=value`):
//   BASE_URL          required, e.g. https://staging.example.com (no trailing slash needed)
//   USERS_JSON        optional, '[{"email":"a@x","password":"p"}]' (overrides the two below)
//   USER_EMAIL / USER_PASSWORD   optional single user
//   BRANCH_ID         optional, otherwise the first branch from GET /product/getbranches
//   SPOOF_XFF         '1' (default) sends a unique X-Forwarded-For per request so the
//                     100 req/min per-IP throttler does not dominate. '0' disables it.
//   PRODUCTION_HOSTS  optional comma list of hostnames this run must refuse to hit
import http from 'k6/http';
import { check, sleep } from 'k6';

// Seeded local/e2e users (apps/e2e/fixtures/users.ts). Staging normally overrides these.
const DEFAULT_EMAIL = 'owner@deepkhata.test';
const DEFAULT_PASSWORD = 'DeepKhata#Test1';

function resolveBaseUrl() {
  const raw = __ENV.BASE_URL;
  if (!raw) {
    throw new Error(
      'BASE_URL is required, e.g. k6 run -e BASE_URL=https://staging.example.com <script>. ' +
        'There is deliberately no default: these scripts write data and trip rate limits.',
    );
  }
  const url = raw.replace(/\/+$/, '');
  const host = (url.match(/^https?:\/\/([^/:]+)/) || [])[1];
  if (!host) throw new Error(`BASE_URL is not a valid http(s) URL: ${raw}`);
  const banned = (__ENV.PRODUCTION_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (banned.includes(host.toLowerCase())) {
    throw new Error(`Refusing to run against ${host}: listed in PRODUCTION_HOSTS.`);
  }
  return url;
}

export const BASE_URL = resolveBaseUrl();

export function loadUsers() {
  if (__ENV.USERS_JSON) {
    const list = JSON.parse(__ENV.USERS_JSON);
    if (!Array.isArray(list) || list.length === 0) throw new Error('USERS_JSON must be a non-empty array');
    return list;
  }
  return [
    {
      email: __ENV.USER_EMAIL || DEFAULT_EMAIL,
      password: __ENV.USER_PASSWORD || DEFAULT_PASSWORD,
    },
  ];
}

/** Random RFC 4122 v4 UUID (client-generated ids for the offline queue). */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const rnd = (n) => Math.floor(Math.random() * n);
export const pad = (n, w = 5) => String(n).padStart(w, '0');

/** Unique fake client IP per (vu, iteration, salt) so the per-IP throttler spreads out. */
export function xff(vu = __VU, it = __ITER, salt = 0) {
  if (__ENV.SPOOF_XFF === '0') return {};
  return { 'x-forwarded-for': `10.${(vu >> 8) & 255}.${vu & 255}.${((it * 7 + salt) & 255) || 1}` };
}

export function authHeaders(session, extra = {}) {
  const h = {
    'content-type': 'application/json',
    Authorization: `Bearer ${session.token}`,
    ...xff(__VU, __ITER, Math.floor(Math.random() * 200)),
  };
  if (session.branchId) h['x-branch-id'] = session.branchId;
  return { ...h, ...extra };
}

/** POST /auth/login (Nest AuthController, cookie + accessToken body). Returns {res, token, user}. */
export function login(user, params = {}) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: { 'content-type': 'application/json', ...xff() },
      tags: { name: 'login' },
      ...params,
    },
  );
  let body = null;
  if (res.status === 200) {
    try {
      body = res.json();
    } catch (e) {
      body = null;
    }
  }
  return { res, token: body && body.accessToken, user: body && body.user };
}

function firstBranchId(token) {
  const res = http.get(`${BASE_URL}/product/getbranches`, {
    headers: { Authorization: `Bearer ${token}`, ...xff(0, 0, 3) },
    tags: { name: 'getbranches' },
  });
  if (res.status !== 200) return undefined;
  const j = res.json();
  const list = Array.isArray(j) ? j : j.branches || j.data || [];
  return list[0] && list[0].id;
}

/**
 * Use inside setup(): logs every configured user in once and returns
 * [{email, token, branchId}]. VUs then share these sessions, so the
 * read/write scenarios do not hammer the login endpoint.
 */
export function setupSessions() {
  const sessions = [];
  loadUsers().forEach((u, i) => {
    const out = login(u, { headers: { 'content-type': 'application/json', ...xff(0, i, 9) } });
    if (!out.token) {
      throw new Error(
        `setup login failed for ${u.email}: HTTP ${out.res.status} ${String(out.res.body).slice(0, 200)}`,
      );
    }
    const branchId =
      __ENV.BRANCH_ID ||
      (out.user && (out.user.branchId || out.user.activeBranchId)) ||
      firstBranchId(out.token);
    sessions.push({ email: u.email, token: out.token, branchId });
  });
  return sessions;
}

export const pickSession = (sessions) => sessions[(__VU - 1) % sessions.length];

/** Sleep for a random think time in [min, max] seconds. */
export function thinkTime(min = 0.5, max = 2) {
  sleep(min + Math.random() * (max - min));
}

/** Authenticated GET with a stable `name` tag and a 200 check. Returns the response. */
export function get(session, path, name, extraTags = {}) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: authHeaders(session),
    tags: { name, ...extraTags },
  });
  check(res, { [`${name} 200`]: (r) => r.status === 200 }, { name });
  return res;
}

export function post(session, path, payload, name, extraTags = {}) {
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { name, ...extraTags },
  });
  return res;
}

/** "30m" | "90s" | "2h" | "1h30m" -> seconds. */
export function parseDuration(s) {
  const re = /(\d+(?:\.\d+)?)(h|m|s)/g;
  let total = 0;
  let m;
  let matched = false;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    total += Number(m[1]) * { h: 3600, m: 60, s: 1 }[m[2]];
  }
  return matched ? total : Number(s) || 0;
}

/** Cheap, high-frequency read endpoints the dashboard shell calls on every page. */
export const COUNTER_ENDPOINTS = [
  // useUnreadCount / useNotifications poll this every 60 s (carries unreadCount).
  { name: 'notifications_unread', path: '/notifications?limit=1' },
  { name: 'dues_summary', path: '/dues/summary' },
  { name: 'businessinfo', path: '/businessinfo' },
  { name: 'user_me', path: '/user/me' },
  { name: 'branches', path: '/product/getbranches' },
];
