import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { offlineDb, type SyncQueueItem } from "./db";

interface SyncItemResult {
  id: string;
  status: "synced" | "failed" | "conflict";
  reason?: string;
  orderId?: string;
}

let isSyncing = false;

export async function flushSyncQueue(): Promise<{
  synced: number;
  errors: number;
}> {
  if (typeof window === "undefined" || isSyncing) {
    return { synced: 0, errors: 0 };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, errors: 0 };
  }

  const token = localStorage.getItem("accessToken");
  if (!token) return { synced: 0, errors: 0 };

  // Only "pending" items are sent automatically. "failed" and "conflict"
  // items wait for a manual retry so they never loop forever.
  const pendingItems = await offlineDb.syncQueue
    .filter((item) => item.status === "pending")
    .toArray();

  if (pendingItems.length === 0) {
    return { synced: 0, errors: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let errors = 0;

  const notify = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sync-queue-updated"));
    }
  };

  // Transport-level problem (offline, 5xx, ...): nothing was decided by the
  // server, so the items go back to "pending" to be retried on the next flush.
  const revertToPending = async (message: string) => {
    await Promise.all(
      pendingItems.map((item) =>
        offlineDb.syncQueue.update(item.id, {
          status: "pending",
          lastError: message,
          attempts: (item.attempts ?? 0) + 1,
        }),
      ),
    );
    errors = pendingItems.length;
    notify();
  };

  try {
    // Mark as syncing in IndexedDB
    await Promise.all(
      pendingItems.map((item) =>
        offlineDb.syncQueue.update(item.id, { status: "syncing" }),
      ),
    );

    const response = await fetch(`${API_BASE_URL}/sync/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items: pendingItems }),
    });

    if (response.ok) {
      const data = (await response.json()) as { results?: SyncItemResult[] };
      const resultById = new Map<string, SyncItemResult>(
        (data.results ?? []).map((r) => [r.id, r]),
      );

      const syncedIds: string[] = [];
      for (const item of pendingItems) {
        const result = resultById.get(item.id);
        if (result?.status === "synced") {
          syncedIds.push(item.id);
        } else if (result?.status === "failed") {
          await offlineDb.syncQueue.update(item.id, {
            status: "failed",
            lastError: result.reason || "Sync failed",
            attempts: (item.attempts ?? 0) + 1,
          });
          errors++;
        } else if (result?.status === "conflict") {
          await offlineDb.syncQueue.update(item.id, {
            status: "conflict",
            lastError: result.reason || "Sync conflict",
            attempts: (item.attempts ?? 0) + 1,
          });
          errors++;
        } else {
          // No result for this item (should not happen): retry later.
          await offlineDb.syncQueue.update(item.id, { status: "pending" });
        }
      }

      if (syncedIds.length > 0) {
        await offlineDb.syncQueue.bulkDelete(syncedIds);
      }
      synced = syncedIds.length;
      notify();
    } else {
      await revertToPending(`Server responded with ${response.status}`);
    }
  } catch (err: unknown) {
    await revertToPending(
      (err instanceof Error ? err.message : "") || "Network sync failed",
    );
  } finally {
    isSyncing = false;
  }

  return { synced, errors };
}

let activeListenerCount = 0;
let globalCleanup: (() => void) | null = null;

export function initOfflineSyncListener(): () => void {
  if (typeof window === "undefined") return () => {};

  activeListenerCount++;

  if (activeListenerCount === 1) {
    const handleOnline = () => {
      void flushSyncQueue();
    };

    window.addEventListener("online", handleOnline);

    // Periodic flush every 20 seconds
    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        void flushSyncQueue();
      }
    }, 20000);

    // Run immediate attempt if online
    if (navigator.onLine) {
      void flushSyncQueue();
    }

    globalCleanup = () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(intervalId);
    };
  }

  return () => {
    activeListenerCount--;
    if (activeListenerCount <= 0) {
      activeListenerCount = 0;
      if (globalCleanup) {
        globalCleanup();
        globalCleanup = null;
      }
    }
  };
}
