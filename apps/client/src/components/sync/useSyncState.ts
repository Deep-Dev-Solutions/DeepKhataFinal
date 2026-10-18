"use client";

import { useSyncExternalStore } from "react";
import { syncEngine, type SyncState } from "@/lib/sync/engine";

const SERVER_STATE: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  needsAttention: 0,
  lastSyncedAt: null,
  lastError: null,
};

/** Live view of the sync engine state (online, syncing, pending, needsAttention, ...). */
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    syncEngine.subscribe,
    syncEngine.getState,
    () => SERVER_STATE,
  );
}
