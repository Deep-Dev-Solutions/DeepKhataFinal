"use client";

import { useCallback, useEffect } from "react";
import { flushSyncQueue, initOfflineSyncListener } from "@/lib/sync";
import { syncEngine } from "@/lib/sync/engine";
import { useSyncState } from "@/components/sync/useSyncState";

/**
 * Backward compatible facade over the app-wide sync engine
 * (`{ isOnline, pendingCount, triggerSync, refreshPendingCount }`).
 */
export function useOfflineSync() {
  const state = useSyncState();

  useEffect(() => {
    // Idempotent: SyncProvider normally started it already.
    return initOfflineSyncListener();
  }, []);

  const refreshPendingCount = useCallback(() => syncEngine.refresh(), []);

  const triggerSync = useCallback(async () => {
    const result = await flushSyncQueue();
    await syncEngine.refresh();
    return result;
  }, []);

  return {
    isOnline: state.online,
    pendingCount: state.pending,
    triggerSync,
    refreshPendingCount,
  };
}
