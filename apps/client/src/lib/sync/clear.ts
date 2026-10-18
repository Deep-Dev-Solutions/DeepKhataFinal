import { offlineDb } from "@/lib/db";

/**
 * Logout hygiene: wipes every cached table and all sync bookkeeping (cursors,
 * lastPullAt) so the next user starts from an empty cache.
 *
 * The write queue is kept by default because it can hold sales that were never
 * synced; pass `{ includeQueue: true }` to drop it as well (only after the user
 * confirmed, or when it is known to be empty).
 */
export async function clearOfflineData(
  opts: { includeQueue?: boolean } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  const tables = [
    offlineDb.products,
    offlineDb.customers,
    offlineDb.instances,
    offlineDb.stockSummary,
    offlineDb.vendors,
    offlineDb.categories,
    offlineDb.cabinets,
    offlineDb.branches,
    offlineDb.meta,
    ...(opts.includeQueue ? [offlineDb.syncQueue] : []),
  ];
  await offlineDb.transaction("rw", tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
