import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { offlineDb, type SyncQueueItem } from "./db";

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

  const pendingItems = await offlineDb.syncQueue
    .filter((item) => item.status === "pending" || item.status === "failed")
    .toArray();

  if (pendingItems.length === 0) {
    return { synced: 0, errors: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let errors = 0;

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
      const data = await response.json();
      const syncedIds: string[] =
        data.syncedIds || pendingItems.map((i) => i.id);

      await offlineDb.syncQueue.bulkDelete(syncedIds);
      synced = syncedIds.length;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sync-queue-updated"));
      }
    } else {
      // Mark back to pending or failed
      await Promise.all(
        pendingItems.map((item) =>
          offlineDb.syncQueue.update(item.id, {
            status: "failed",
            error: `Server responded with ${response.status}`,
          }),
        ),
      );
      errors = pendingItems.length;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sync-queue-updated"));
      }
    }
  } catch (err: any) {
    await Promise.all(
      pendingItems.map((item) =>
        offlineDb.syncQueue.update(item.id, {
          status: "failed",
          error: err?.message || "Network sync failed",
        }),
      ),
    );
    errors = pendingItems.length;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sync-queue-updated"));
    }
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
