// Offline burst: many devices come back online and flush their queue at once.
//   k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/offline-burst.js
// Optional: -e VUS=50 -e ITERATIONS=3 -e MIN_ITEMS=20 -e MAX_ITEMS=50
//
// Each iteration builds ONE batch of 20-50 queue items with client-generated UUIDs, POSTs it to
// /sync/batch, then POSTs the IDENTICAL body again. The replay must report every item as
// `synced` (the server recognises the ids), and the second pass must not create anything new.
// Item shapes follow apps/server/src/sync/sync.service.ts:
//   UPSERT_CUSTOMER, CREATE_ORDER (service line, part-paid on credit), RECORD_PAYMENT,
//   CREATE_KHATA_ENTRY, CREATE_EXPENSE. Service lines never touch stock.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL,
  setupSessions,
  pickSession,
  authHeaders,
  thinkTime,
  uuid,
  rnd,
  pad,
} from './lib/common.js';

const MIN_ITEMS = Number(__ENV.MIN_ITEMS || 20);
const MAX_ITEMS = Number(__ENV.MAX_ITEMS || 50);

const batchDuration = new Trend('sync_batch_duration', true);
const replayDuration = new Trend('sync_replay_duration', true);
const server5xx = new Counter('sync_5xx');
const firstPassAllSynced = new Rate('sync_first_pass_all_synced');
const replayAllSynced = new Rate('sync_replay_all_synced');
// Informational: items the first pass did not sync but the replay did (a retry, not a duplicate).
const replayCreatedNew = new Counter('sync_replay_new_items');
const itemsSent = new Counter('sync_items_sent');
const itemsFailed = new Counter('sync_items_failed_first_pass');

export const options = {
  scenarios: {
    burst: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS || 50),
      iterations: Number(__ENV.ITERATIONS || 3),
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  thresholds: {
    sync_batch_duration: ['p(95)<2000'],
    sync_replay_duration: ['p(95)<2000'],
    sync_5xx: ['count==0'],
    sync_replay_all_synced: ['rate==1'],
    // Not a hard gate on first pass (stock/credit rules can legitimately reject), but watch it.
    sync_first_pass_all_synced: ['rate>0.95'],
  },
};

export function setup() {
  return { sessions: setupSessions() };
}

/** One customer + order + payment + khata entry + expense, in dependency order. */
function group() {
  const customerId = uuid();
  const orderId = uuid();
  const phone = `03${pad(rnd(1e9), 9)}`;
  return [
    {
      id: customerId,
      type: 'UPSERT_CUSTOMER',
      payload: { name: `K6 Burst ${phone}`, phone },
    },
    {
      id: orderId,
      type: 'CREATE_ORDER',
      payload: {
        customerId,
        orderStatus: 'FINAL',
        paymentMethod: 'CASH',
        items: [{ isService: true, serviceName: 'k6 burst service', quantity: 1, price: 200 }],
        amountPaid: 50, // 150 goes on the customer's credit line, so a payment can follow
      },
    },
    { id: uuid(), type: 'RECORD_PAYMENT', payload: { orderId, amount: 10, method: 'CASH' } },
    {
      id: uuid(),
      type: 'CREATE_KHATA_ENTRY',
      payload: { direction: 'RECEIVABLE', partyType: 'OTHER', partyName: 'k6 burst', amount: 100 },
    },
    {
      id: uuid(),
      type: 'CREATE_EXPENSE',
      payload: { amount: 20, category: 'CHAI_REFRESHMENT', description: 'k6 burst' },
    },
  ];
}

function buildBatch() {
  const target = MIN_ITEMS + rnd(MAX_ITEMS - MIN_ITEMS + 1);
  const items = [];
  while (items.length < target) items.push(...group());
  return { items: items.slice(0, target) };
}

function summarise(res) {
  if (res.status !== 200 && res.status !== 201) return null;
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

export default function (data) {
  const s = pickSession(data.sessions);
  const batch = buildBatch();
  const body = JSON.stringify(batch);
  itemsSent.add(batch.items.length);

  const params = (name) => ({ headers: authHeaders(s), tags: { name }, timeout: '60s' });

  // 1) First flush.
  const r1 = http.post(`${BASE_URL}/sync/batch`, body, params('sync_batch'));
  batchDuration.add(r1.timings.duration);
  if (r1.status >= 500) server5xx.add(1);
  const j1 = summarise(r1);
  const okStatus1 = check(r1, { 'first flush 2xx': (r) => r.status === 200 || r.status === 201 });
  if (okStatus1 && j1) {
    const failed = j1.results.filter((x) => x.status !== 'synced');
    firstPassAllSynced.add(failed.length === 0);
    itemsFailed.add(failed.length);
    if (failed.length && __ITER === 0 && __VU <= 3) {
      console.warn(`VU ${__VU}: first pass had ${failed.length} non-synced, e.g. ${JSON.stringify(failed[0])}`);
    }
  }

  // 2) Replay the SAME body (same ids). Server must treat every id as already synced.
  const r2 = http.post(`${BASE_URL}/sync/batch`, body, params('sync_replay'));
  replayDuration.add(r2.timings.duration);
  if (r2.status >= 500) server5xx.add(1);
  const j2 = summarise(r2);
  check(r2, { 'replay 2xx': (r) => r.status === 200 || r.status === 201 });
  if (j2) {
    const allSynced =
      j2.results.length === batch.items.length && j2.results.every((x) => x.status === 'synced');
    replayAllSynced.add(allSynced);
    check(j2, { 'replay reports all items synced': () => allSynced });
    if (j1 && j1.results) {
      const firstOk = new Set(j1.results.filter((x) => x.status === 'synced').map((x) => x.id));
      replayCreatedNew.add(j2.results.filter((x) => x.status === 'synced' && !firstOk.has(x.id)).length);
    }
    if (!allSynced && __VU <= 3) {
      const bad = j2.results.find((x) => x.status !== 'synced');
      console.warn(`VU ${__VU}: replay not idempotent, e.g. ${JSON.stringify(bad)}`);
    }
  } else {
    replayAllSynced.add(false);
  }

  thinkTime(0.5, 2);
}
