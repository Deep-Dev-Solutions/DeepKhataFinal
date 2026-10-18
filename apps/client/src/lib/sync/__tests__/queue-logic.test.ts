import { describe, expect, it } from "vitest";
import type { SyncQueueItem } from "../../db";
import {
  MAX_ATTEMPTS,
  STALE_SYNCING_MS,
  authPausePatch,
  backoffDelayMs,
  isDue,
  isStaleSyncing,
  resultAction,
  retryPatch,
  upgradeQueueItem,
} from "../queue-logic";

const NOW = Date.parse("2026-01-01T10:00:00.000Z");

const item = (over: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
  id: "i1",
  type: "CREATE_ORDER",
  payload: { items: [{ productId: "p1", quantity: 1 }], amountPaid: 100 },
  createdAt: "2026-01-01T09:00:00.000Z",
  status: "pending",
  ...over,
});

describe("backoff", () => {
  it("is min(2^n x 5s, 10 min)", () => {
    expect(backoffDelayMs(1)).toBe(10_000);
    expect(backoffDelayMs(2)).toBe(20_000);
    expect(backoffDelayMs(5)).toBe(160_000);
    expect(backoffDelayMs(7)).toBe(600_000);
    expect(backoffDelayMs(50)).toBe(600_000);
  });

  it("schedules the next attempt and counts attempts", () => {
    const patch = retryPatch(item({ attempts: 2 }), NOW, "offline");
    expect(patch).toMatchObject({ status: "pending", attempts: 3, lastError: "offline" });
    expect(patch.nextAttemptAt).toBe(new Date(NOW + 40_000).toISOString());
  });

  it("gives up after 10 attempts and shows the item as failed", () => {
    const patch = retryPatch(item({ attempts: MAX_ATTEMPTS - 1 }), NOW, "boom");
    expect(patch.status).toBe("failed");
    expect(patch.attempts).toBe(MAX_ATTEMPTS);
    expect(patch.lastError).toContain("boom");
  });

  it("treats a missing attempts field (POS-written items) as 0", () => {
    expect(retryPatch(item(), NOW, "x").attempts).toBe(1);
  });

  it("auth pauses do not burn an attempt", () => {
    const patch = authPausePatch(NOW, "expired");
    expect(patch.attempts).toBeUndefined();
    expect(patch.status).toBe("pending");
  });

  it("isDue respects nextAttemptAt", () => {
    expect(isDue(item(), NOW)).toBe(true);
    expect(isDue(item({ nextAttemptAt: new Date(NOW + 1).toISOString() }), NOW)).toBe(false);
    expect(isDue(item({ nextAttemptAt: new Date(NOW).toISOString() }), NOW)).toBe(true);
  });
});

describe("stale syncing recovery", () => {
  it("flags syncing items older than 2 minutes or without a start time", () => {
    const fresh = item({ status: "syncing", syncStartedAt: new Date(NOW - 1000).toISOString() });
    const old = item({ status: "syncing", syncStartedAt: new Date(NOW - STALE_SYNCING_MS - 1).toISOString() });
    expect(isStaleSyncing(fresh, NOW)).toBe(false);
    expect(isStaleSyncing(old, NOW)).toBe(true);
    expect(isStaleSyncing(item({ status: "syncing" }), NOW)).toBe(true);
    expect(isStaleSyncing(item({ status: "pending" }), NOW)).toBe(false);
  });
});

describe("server verdicts", () => {
  it("synced items are removed", () => {
    expect(resultAction(item(), { id: "i1", status: "synced" }, NOW)).toEqual({ action: "delete" });
  });

  it("failed and conflict keep the reason and wait for the user", () => {
    const failed = resultAction(item({ attempts: 1 }), { id: "i1", status: "failed", reason: "Permission denied" }, NOW);
    expect(failed).toEqual({
      action: "update",
      patch: expect.objectContaining({ status: "failed", lastError: "Permission denied", attempts: 2, nextAttemptAt: undefined }),
    });
    const conflict = resultAction(item(), { id: "i1", status: "conflict", reason: "Stock changed" }, NOW);
    expect(conflict).toMatchObject({ action: "update", patch: { status: "conflict", lastError: "Stock changed" } });
  });

  it("a missing result is retried with backoff, never dropped", () => {
    const res = resultAction(item(), undefined, NOW);
    expect(res).toMatchObject({ action: "update", patch: { status: "pending", attempts: 1 } });
  });
});

describe("v1 -> v2 queue upgrade", () => {
  it("keeps every queued item and payload; syncing goes back to pending", () => {
    const v1: SyncQueueItem[] = [
      item({ id: "a", status: "pending" }),
      item({ id: "b", status: "syncing" }),
      item({ id: "c", status: "failed", lastError: "bad" }),
      item({ id: "d", status: "conflict", lastError: "stale", attempts: 3 }),
    ];
    const v2 = v1.map(upgradeQueueItem);
    expect(v2.map((i) => [i.id, i.status])).toEqual([
      ["a", "pending"],
      ["b", "pending"],
      ["c", "failed"],
      ["d", "conflict"],
    ]);
    expect(v2.map((i) => i.attempts)).toEqual([0, 0, 0, 3]);
    expect(v2.map((i) => i.payload)).toEqual(v1.map((i) => i.payload));
    expect(v2[2].lastError).toBe("bad");
  });
});
