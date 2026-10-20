import { offlineDb, type SyncQueueItem, type SyncQueueType } from "@/lib/db";
import { isDue, isStaleSyncing } from "./queue-logic";

export const SYNC_QUEUE_EVENT = "sync-queue-updated";

export function notifyQueueUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_QUEUE_EVENT));
  }
}

/**
 * Appends a write to the offline queue. The id doubles as the server-side
 * idempotency key. Fires `sync-queue-updated`, which makes the engine push.
 */
export async function enqueue(
  type: SyncQueueType,
  payload: Record<string, unknown>,
  id: string = crypto.randomUUID(),
): Promise<string> {
  await offlineDb.syncQueue.put({
    id,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  notifyQueueUpdated();
  return id;
}

export interface QueueCounts {
  /** pending + syncing: still on their way to the server. */
  pending: number;
  /** failed + conflict: waiting for the user. */
  needsAttention: number;
}

export async function countQueue(): Promise<QueueCounts> {
  let pending = 0;
  let needsAttention = 0;
  await offlineDb.syncQueue.each((item) => {
    if (item.status === "pending" || item.status === "syncing") pending++;
    else needsAttention++;
  });
  return { pending, needsAttention };
}

/** Failed and conflict items, oldest first, for the "needs attention" panel. */
export async function listAttentionItems(): Promise<SyncQueueItem[]> {
  const items = await offlineDb.syncQueue
    .filter((i) => i.status === "failed" || i.status === "conflict")
    .toArray();
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Puts orphaned "syncing" items (older than 2 minutes) back to "pending". */
export async function recoverStaleSyncing(now: number): Promise<number> {
  const stale = await offlineDb.syncQueue
    .filter((i) => isStaleSyncing(i, now))
    .primaryKeys();
  if (stale.length === 0) return 0;
  await Promise.all(
    stale.map((id) =>
      offlineDb.syncQueue.update(id, {
        status: "pending",
        syncStartedAt: undefined,
      }),
    ),
  );
  return stale.length;
}

/** Pending items that may be sent now (all of them when `force`), oldest first. */
export async function loadDueItems(
  now: number,
  force: boolean,
): Promise<SyncQueueItem[]> {
  const items = await offlineDb.syncQueue
    .filter((i) => i.status === "pending" && (force || isDue(i, now)))
    .toArray();
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** failed/conflict -> pending again, attempts reset. */
export async function retryItem(id: string): Promise<boolean> {
  const item = await offlineDb.syncQueue.get(id);
  if (!item || (item.status !== "failed" && item.status !== "conflict")) {
    return false;
  }
  await offlineDb.syncQueue.update(id, {
    status: "pending",
    attempts: 0,
    nextAttemptAt: undefined,
    syncStartedAt: undefined,
  });
  notifyQueueUpdated();
  return true;
}

/** Removes a failed/conflict item. Pending and syncing items cannot be discarded. */
export async function discardItem(id: string): Promise<boolean> {
  const item = await offlineDb.syncQueue.get(id);
  if (!item || (item.status !== "failed" && item.status !== "conflict")) {
    return false;
  }
  await offlineDb.syncQueue.delete(id);
  notifyQueueUpdated();
  return true;
}
