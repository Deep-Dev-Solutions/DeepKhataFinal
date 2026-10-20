// Node fallback load runner (no k6 needed). Usage:
//   BASE_URL=http://localhost:5199 node apps/bench/run.mjs [--duration=60] [--vus=10] [--only=name]
// Credentials come from the seeded owner (apps/e2e/fixtures/users.ts).
// Each request carries a unique X-Forwarded-For so the API's 100 req/min per-IP
// throttler (trust proxy = loopback) does not distort latency numbers.
import { users, TEST_PASSWORD } from '../e2e/fixtures/users.ts';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const DURATION_S = Number(arg('duration', 60));
const VUS = Number(arg('vus', 10));
const ONLY = arg('only', '');
const TARGET_P95 = 300;

let ipCounter = 0;
const fakeIp = () => {
  const n = ipCounter++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() },
    body: JSON.stringify({ email: users.ownerA.email, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const body = await res.json();
  const token = body.accessToken ?? body.access_token ?? body.data?.accessToken;
  if (!token) throw new Error('no accessToken in login response');
  const branchId =
    body.user?.branchId ?? body.branchId ?? body.user?.branches?.[0]?.id ?? body.branches?.[0]?.id;
  return { token, branchId, body };
}

async function resolveBranch(token) {
  const res = await fetch(`${BASE}/product/getbranches`, {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': fakeIp() },
  });
  if (!res.ok) return undefined;
  const j = await res.json();
  const list = Array.isArray(j) ? j : (j.branches ?? j.data ?? []);
  return list[0]?.id;
}

const pad = (n) => String(n).padStart(5, '0');
const rnd = (n) => Math.floor(Math.random() * n);
const typo = (s) => {
  // swap two adjacent chars in the middle -> fuzzy tier
  const i = Math.floor(s.length / 2);
  return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
};

const scenarios = {
  'stock-finder exact SKU': () => `/stock/find?q=${encodeURIComponent(`A-LSKU-${pad(rnd(5000))}`)}`,
  'stock-finder prefix': () => `/stock/find?q=${encodeURIComponent(`a-lsku-${pad(rnd(500)).slice(0, 3)}`)}`,
  'stock-finder typo (fuzzy)': () =>
    `/stock/find?q=${encodeURIComponent(typo(`bench part a-${rnd(5000)}`))}`,
  'getproducts page 1': () => `/product/getproducts?limit=50`,
  'getproducts search': () => `/product/getproducts?limit=50&search=${encodeURIComponent(`A-LSKU-${pad(rnd(5000))}`)}`,
};

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function runScenario(name, mkPath, headers) {
  const lat = [];
  let errors = 0;
  const end = Date.now() + DURATION_S * 1000;
  const vu = async () => {
    while (Date.now() < end) {
      const t0 = performance.now();
      try {
        const res = await fetch(BASE + mkPath(), {
          headers: { ...headers, 'x-forwarded-for': fakeIp() },
        });
        await res.arrayBuffer();
        if (!res.ok) errors++;
        else lat.push(performance.now() - t0);
      } catch {
        errors++;
      }
    }
  };
  await Promise.all(Array.from({ length: VUS }, vu));
  lat.sort((a, b) => a - b);
  const r = {
    name,
    requests: lat.length + errors,
    errors,
    rps: +(lat.length / DURATION_S).toFixed(1),
    p50: +pct(lat, 50).toFixed(1),
    p95: +pct(lat, 95).toFixed(1),
    p99: +pct(lat, 99).toFixed(1),
    max: +(lat[lat.length - 1] ?? NaN).toFixed(1),
  };
  r.pass = r.p95 < TARGET_P95 && errors === 0;
  return r;
}

const { token, branchId: loginBranch } = await login();
const branchId = process.env.BRANCH_ID ?? loginBranch ?? (await resolveBranch(token));
if (!branchId) throw new Error('could not determine branch id');
const headers = { authorization: `Bearer ${token}`, 'x-branch-id': branchId };

// Warm-up (not counted): primes plan cache / connection pool.
for (const mk of Object.values(scenarios)) {
  for (let i = 0; i < 5; i++) await (await fetch(BASE + mk(), { headers: { ...headers, 'x-forwarded-for': fakeIp() } })).arrayBuffer();
}

const results = [];
for (const [name, mk] of Object.entries(scenarios)) {
  if (ONLY && !name.includes(ONLY)) continue;
  console.error(`running: ${name} (${VUS} VUs, ${DURATION_S}s)`);
  results.push(await runScenario(name, mk, headers));
}
console.log(JSON.stringify(results, null, 2));
console.log('\n| scenario | reqs | errors | rps | p50 ms | p95 ms | p99 ms | p95<300 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of results)
  console.log(`| ${r.name} | ${r.requests} | ${r.errors} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.pass ? 'PASS' : 'FAIL'} |`);
