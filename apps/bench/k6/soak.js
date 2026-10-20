// Soak: constant 30 VUs for SOAK_DURATION (default 30m), mostly reads plus a few low-rate writes.
//   k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/soak.js
// Optional: -e SOAK_DURATION=2h -e VUS=30 -e WRITE_RATIO=0.03
//
// Memory drift: the API exposes no memory metric. GET /health returns {status, db, version, uptime}.
// This script polls it every ~30 s per VU 1 and counts `health_restarts` whenever uptime goes
// backwards (a crash/OOM kill/redeploy during the soak). Watch RSS/heap on the host at the same
// time (docker stats, pm2 monit, Prometheus node/cAdvisor). Latency drift is checked here by
// tagging every read with the window of the run (early/mid/late thirds) and requiring the late
// p95 to stay under the threshold.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL,
  COUNTER_ENDPOINTS,
  setupSessions,
  pickSession,
  get,
  post,
  thinkTime,
  parseDuration,
  rnd,
  pad,
  xff,
} from './lib/common.js';

const DURATION = __ENV.SOAK_DURATION || '30m';
const TOTAL_S = parseDuration(DURATION) || 1800;
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || 0.03);
const SKU_PREFIX = __ENV.SEARCH_PREFIX || 'A-LSKU-';

const healthRestarts = new Counter('health_restarts');
const healthUptime = new Trend('health_uptime_s');
const writeOk = new Counter('soak_writes_ok');
const writeFail = new Counter('soak_writes_failed');

export const options = {
  scenarios: {
    soak: { executor: 'constant-vus', vus: Number(__ENV.VUS || 30), duration: DURATION },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{window:early}': ['p(95)<500'],
    'http_req_duration{window:mid}': ['p(95)<500'],
    'http_req_duration{window:late}': ['p(95)<500'],
    health_restarts: ['count==0'],
    soak_writes_failed: ['count<5'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return { sessions: setupSessions() };
}

function windowTag() {
  const t = (Date.now() - exec.scenario.startTime) / 1000;
  return t < TOTAL_S / 3 ? 'early' : t < (2 * TOTAL_S) / 3 ? 'mid' : 'late';
}

let lastUptime = -1;
let lastHealth = 0;

function pollHealth() {
  if (Date.now() - lastHealth < 30000) return;
  lastHealth = Date.now();
  const r = http.get(`${BASE_URL}/health`, { headers: xff(), tags: { name: 'health' } });
  if (r.status !== 200) return;
  const up = Number(r.json('uptime'));
  healthUptime.add(up);
  if (lastUptime >= 0 && up + 5 < lastUptime) healthRestarts.add(1);
  lastUptime = up;
}

function writeCustomer(s, w) {
  // 03 + 9 random digits keeps the phone unique per business.
  const phone = `03${pad(rnd(1e9), 9)}`;
  const r = post(s, '/customer/newcustomer', { name: `K6 Soak ${phone}`, phone }, 'write_customer', { window: w });
  return r.status === 201 || r.status === 200;
}

function writeSale(s, w) {
  // Service line item: touches the order + ledger path but never decrements stock.
  const r = post(
    s,
    '/order/neworder',
    {
      walkInName: 'k6-soak',
      orderStatus: 'FINAL',
      paymentMethod: 'CASH',
      items: [{ isService: true, serviceName: 'k6 soak service', quantity: 1, price: 100 }],
      amountPaid: 100,
    },
    'write_sale',
    { window: w },
  );
  return r.status === 201 || r.status === 200;
}

export default function (data) {
  const s = pickSession(data.sessions);
  const w = windowTag();

  if (__VU === 1) pollHealth();

  if (Math.random() < WRITE_RATIO) {
    const ok = Math.random() < 0.5 ? writeCustomer(s, w) : writeSale(s, w);
    check(ok, { 'write succeeded': (v) => v === true });
    (ok ? writeOk : writeFail).add(1);
  } else {
    const roll = Math.random();
    if (roll < 0.35) {
      const e = COUNTER_ENDPOINTS[rnd(COUNTER_ENDPOINTS.length)];
      get(s, e.path, e.name, { window: w });
    } else if (roll < 0.65) {
      get(s, '/product/getproducts?limit=50', 'products_list', { window: w });
    } else if (roll < 0.85) {
      get(s, `/stock/find?q=${encodeURIComponent(SKU_PREFIX + pad(rnd(5000)))}`, 'stock_find', { window: w });
    } else if (roll < 0.95) {
      get(s, '/customer/getallcustomers', 'customers_list', { window: w });
    } else {
      get(s, '/order/getallorders', 'orders_list', { window: w });
    }
  }
  thinkTime(0.5, 2);
}
