import type { SyncQueueItem } from "../db";

/**
 * Pure queue rules (no IndexedDB, no network) so they can be unit tested.
 */

export const MAX_ATTEMPTS = 10;
export const BACKOFF_BASE_MS = 5_000;
export const MAX_BACKOFF_MS = 10 * 60 * 1000;
/** A "syncing" item older than this was orphaned (tab closed / crash) and is retried. */
export const STALE_SYNCING_MS = 2 * 60 * 1000;
/** Delay used for auth problems (401/403) that do not count as an attempt. */
export const AUTH_RETRY_MS = 60_000;

export interface BatchResult {
  id: string;
  status: "synced" | "failed" | "conflict";
  reason?: string;
  orderId?: string;
}

/** Delay after the n-th failed attempt: min(2^n x 5 s, 10 min). */
export function backoffDelayMs(attempts: number): number {
  const n = Math.max(0, attempts);
  // 2^n overflows nothing here: capped long before n gets large.
  return Math.min(2 ** Math.min(n, 30) * BACKOFF_BASE_MS, MAX_BACKOFF_MS);
}

export function isDue(item: SyncQueueItem, now: number): boolean {
  if (!item.nextAttemptAt) return true;
  const at = Date.parse(item.nextAttemptAt);
  return Number.isNaN(at) || at <= now;
}

export function isStaleSyncing(item: SyncQueueItem, now: number): boolean {
  if (item.status !== "syncing") return false;
  if (!item.syncStartedAt) return true;
  const started = Date.parse(item.syncStartedAt);
  return Number.isNaN(started) || now - started > STALE_SYNCING_MS;
}

/** Transport-level failure (offline, 5xx, timeout): count an attempt and back off. */
export function retryPatch(
  item: SyncQueueItem,
  now: number,
  message: string,
): Partial<SyncQueueItem> {
  const attempts = (item.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return {
      status: "failed",
      attempts,
      lastError: `${message} (gave up after ${attempts} attempts)`,
      nextAttemptAt: undefined,
      syncStartedAt: undefined,
    };
  }
  return {
    status: "pending",
    attempts,
    lastError: message,
    nextAttemptAt: new Date(now + backoffDelayMs(attempts)).toISOString(),
    syncStartedAt: undefined,
  };
}

/** Auth problem: the server never looked at the item, so no attempt is burnt. */
export function authPausePatch(
  now: number,
  message: string,
): Partial<SyncQueueItem> {
  return {
    status: "pending",
    lastError: message,
    nextAttemptAt: new Date(now + AUTH_RETRY_MS).toISOString(),
    syncStartedAt: undefined,
  };
}

export type ResultAction =
  | { action: "delete" }
  | { action: "update"; patch: Partial<SyncQueueItem> };

/** Applies the server's per-item verdict. Every item ends synced, failed or conflict. */
export function resultAction(
  item: SyncQueueItem,
  result: BatchResult | undefined,
  now: number,
): ResultAction {
  if (!result) {
    return {
      action: "update",
      patch: retryPatch(item, now, "Server returned no result for this item"),
    };
  }
  if (result.status === "synced") return { action: "delete" };
  const attempts = (item.attempts ?? 0) + 1;
  return {
    action: "update",
    patch: {
      status: result.status === "conflict" ? "conflict" : "failed",
      attempts,
      lastError:
        result.reason ||
        (result.status === "conflict" ? "Sync conflict" : "Sync failed"),
      nextAttemptAt: undefined,
      syncStartedAt: undefined,
    },
  };
}

/** v1 -> v2 queue upgrade: keep everything, interrupted "syncing" goes back to "pending". */
export function upgradeQueueItem(item: SyncQueueItem): SyncQueueItem {
  return {
    ...item,
    status: item.status === "syncing" ? "pending" : item.status,
    attempts: item.attempts ?? 0,
  };
}
