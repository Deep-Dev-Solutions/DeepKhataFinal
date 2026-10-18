// k6 script: k6 run -e BASE_URL=http://localhost:5199 -e TOKEN=<jwt> -e BRANCH_ID=<id> apps/bench/k6/stock-finder.js
// Get TOKEN from POST /auth/login. Each VU sends a unique X-Forwarded-For to dodge the per-IP throttler.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:5199';
const headers = (vu, it) => ({
  Authorization: `Bearer ${__ENV.TOKEN}`,
  'x-branch-id': __ENV.BRANCH_ID,
  'x-forwarded-for': `10.${vu & 255}.${(it >> 8) & 255}.${it & 255}`,
});
const pad = (n) => String(n).padStart(5, '0');
const rnd = (n) => Math.floor(Math.random() * n);
const typo = (s) => { const i = s.length >> 1; return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2); };

const scenario = (exec) => ({ executor: 'constant-vus', vus: 10, duration: '60s', exec });
export const options = {
  scenarios: {
    exact: { ...scenario('exact'), startTime: '0s' },
    prefix: { ...scenario('prefix'), startTime: '60s' },
    typo: { ...scenario('fuzzy'), startTime: '120s' },
    list: { ...scenario('list'), startTime: '180s' },
    listSearch: { ...scenario('listSearch'), startTime: '240s' },
  },
  thresholds: {
    'http_req_duration{scenario:exact}': ['p(95)<300'],
    'http_req_duration{scenario:prefix}': ['p(95)<300'],
    'http_req_duration{scenario:typo}': ['p(95)<300'],
    'http_req_duration{scenario:list}': ['p(95)<300'],
    'http_req_duration{scenario:listSearch}': ['p(95)<300'],
  },
};
const get = (path) => { const r = http.get(BASE + path, { headers: headers(__VU, __ITER) }); check(r, { ok: (x) => x.status === 200 }); };
export function exact() { get(`/stock/find?q=${encodeURIComponent(`A-LSKU-${pad(rnd(5000))}`)}`); }
export function prefix() { get(`/stock/find?q=${encodeURIComponent(`a-lsku-${pad(rnd(500)).slice(0, 3)}`)}`); }
export function fuzzy() { get(`/stock/find?q=${encodeURIComponent(typo(`bench part a-${rnd(5000)}`))}`); }
export function list() { get('/product/getproducts?limit=50'); }
export function listSearch() { get(`/product/getproducts?limit=50&search=${encodeURIComponent(`A-LSKU-${pad(rnd(5000))}`)}`); }
