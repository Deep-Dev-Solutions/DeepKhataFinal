// Spike: 0 -> 200 VUs in 30 s, hold 1 min, drop. Reads only: product list, stock finder, counters.
//   k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/spike.js
// Optional: -e PEAK_VUS=200 -e SEARCH_PREFIX=A-LSKU- (matches `db:seed -- --large` SKUs)
import {
  COUNTER_ENDPOINTS,
  setupSessions,
  pickSession,
  get,
  thinkTime,
  rnd,
  pad,
} from './lib/common.js';

const PEAK = Number(__ENV.PEAK_VUS || 200);
const SKU_PREFIX = __ENV.SEARCH_PREFIX || 'A-LSKU-';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: PEAK },
        { duration: '1m', target: PEAK },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.02'],
    'http_req_duration{name:products_list}': ['p(95)<800'],
    'http_req_duration{name:stock_find}': ['p(95)<800'],
    'http_req_duration{name:notifications_unread}': ['p(95)<800'],
    checks: ['rate>0.98'],
  },
};

export function setup() {
  return { sessions: setupSessions() };
}

export default function (data) {
  const s = pickSession(data.sessions);
  const roll = Math.random();
  if (roll < 0.4) {
    get(s, '/product/getproducts?limit=50', 'products_list');
  } else if (roll < 0.8) {
    // Mix exact SKU lookups with a prefix search, like a counter operator typing.
    const q = Math.random() < 0.5 ? `${SKU_PREFIX}${pad(rnd(5000))}` : SKU_PREFIX.toLowerCase() + pad(rnd(500)).slice(0, 3);
    get(s, `/stock/find?q=${encodeURIComponent(q)}`, 'stock_find');
  } else {
    const e = COUNTER_ENDPOINTS[rnd(COUNTER_ENDPOINTS.length)];
    get(s, e.path, e.name);
  }
  thinkTime(0.2, 1);
}
