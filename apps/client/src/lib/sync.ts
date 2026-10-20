import { syncEngine } from "@/lib/sync/engine";

export { enqueue } from "@/lib/sync/queue";
export { clearOfflineData } from "@/lib/sync/clear";
export { syncEngine } from "@/lib/sync/engine";

/**
 * Thin wrapper kept for the POS page: pushes the queue now (ignoring backoff),
 * then pulls deltas. All the work lives in lib/sync/engine.ts.
 */
export async function flushSyncQueue(): Promise<{
  synced: number;
  errors: number;
}> {
  if (typeof window === "undefined") return { synced: 0, errors: 0 };
  return syncEngine.syncNow({ force: true });
}

/**
 * Makes sure the app-wide engine is running (it is normally started by
 * SyncProvider). The engine outlives any single page, so the returned cleanup
 * is intentionally a no-op.
 */
export function initOfflineSyncListener(): () => void {
  syncEngine.start();
  return () => {};
}
