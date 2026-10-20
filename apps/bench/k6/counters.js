// Steady load on the cheap, high-frequency reads the app shell polls on every page.
//   k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/counters.js
// Optional: -e VUS=20 -e DURATION=5m
import http from 'k6/http';
import { check } from 'k6';
import {
  BASE_URL,
  COUNTER_ENDPOINTS,
  setupSessions,
  pickSession,
  get,
  thinkTime,
  xff,
} from './lib/common.js';

const perEndpoint = {};
for (const e of [...COUNTER_ENDPOINTS, { name: 'health' }]) {
  perEndpoint[`http_req_duration{name:${e.name}}`] = ['p(95)<300'];
}

export const options = {
  scenarios: {
    counters: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    ...perEndpoint,
  },
};

export function setup() {
  return { sessions: setupSessions() };
}

export default function (data) {
  const session = pickSession(data.sessions);

  // One "page load": every counter the shell fetches, then think time.
  for (const e of COUNTER_ENDPOINTS) get(session, e.path, e.name);

  // Public liveness probe (also does SELECT 1), as the load balancer would call it.
  const h = http.get(`${BASE_URL}/health`, { headers: xff(), tags: { name: 'health' } });
  check(h, { 'health 200 and db up': (r) => r.status === 200 && r.json('db') === 'up' });

  thinkTime(1, 3);
}
