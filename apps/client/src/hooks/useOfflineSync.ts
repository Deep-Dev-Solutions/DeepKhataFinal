"use client";

import { useState, useEffect, useCallback } from "react";
import { offlineDb } from "@/lib/db";
import { flushSyncQueue, initOfflineSyncListener } from "@/lib/sync";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await offlineDb.syncQueue
        .filter((i) => i.status === "pending" || i.status === "failed")
        .count();
      setPendingCount(count);
    } catch {
      // Ignore errors when DB not initialized yet
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      void refreshPendingCount();
    };

    const handleOffline = () => {
      setIsOnline(false);
      void refreshPendingCount();
    };

    const handleSyncQueueUpdated = () => {
      void refreshPendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("sync-queue-updated", handleSyncQueueUpdated);

    // Initial sync listener
    const cleanupSync = initOfflineSyncListener();
    void refreshPendingCount();

    const interval = window.setInterval(() => {
      void refreshPendingCount();
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("sync-queue-updated", handleSyncQueueUpdated);
      cleanupSync();
      window.clearInterval(interval);
    };
  }, [refreshPendingCount]);

  const triggerSync = useCallback(async () => {
    const result = await flushSyncQueue();
    await refreshPendingCount();
    return result;
  }, [refreshPendingCount]);

  return { isOnline, pendingCount, triggerSync, refreshPendingCount };
}
