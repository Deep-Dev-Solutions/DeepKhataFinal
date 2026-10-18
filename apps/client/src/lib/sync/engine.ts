import { offlineDb, type SyncQueueItem } from "@/lib/db";
import { getActiveBranchId, hasSession, SyncHttpError, syncFetch } from "./http";
import { pullAllEntities } from "./pull";
import {
  countQueue,
  discardItem,
  loadDueItems,
  notifyQueueUpdated,
  recoverStaleSyncing,
  retryItem,
  SYNC_QUEUE_EVENT,
} from "./queue";
import {
  authPausePatch,
  resultAction,
  retryPatch,
  type BatchResult,
} from "./queue-logic";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  /** pending + syncing queue items */
  pending: number;
  /** failed + conflict queue items */
  needsAttention: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface PushResult {
  synced: number;
  errors: number;
  /** The run stopped early (offline, auth, server down): skip the pull. */
  fatal: boolean;
}

const INITIAL_STATE: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  needsAttention: 0,
  lastSyncedAt: null,
  lastError: null,
};

const BATCH_SIZE = 50;
const PUSH_TICK_MS = 10_000;
const PULL_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 250;
const LAST_PULL_KEY = "lastPullAt";

/** Serialises work across tabs when Web Locks exist; otherwise just runs. */
async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(name, { ifAvailable: true }, async (lock) =>
    lock ? fn() : null,
  );
}

function messageOf(err: unknown, fallback: string): string {
  return (err instanceof Error && err.message) || fallback;
}

class SyncEngine {
  private state: SyncState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private started = false;
  private teardown: Array<() => void> = [];
  private pushing = false;
  private pulling = false;
  private cycle: Promise<{ synced: number; errors: number }> | null = null;
  private selfNotify = false;
  private debounceId: number | null = null;
  private pushError: string | null = null;
  private pullError: string | null = null;

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setState(patch: Partial<SyncState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(next) as Array<keyof SyncState>).some(
      (k) => next[k] !== this.state[k],
    );
    if (!changed) return;
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }

  private updateSyncing(): void {
    this.setState({ syncing: this.pushing || this.pulling });
  }

  private publishError(): void {
    this.setState({ lastError: this.pushError ?? this.pullError });
  }

  /** Re-reads the queue counts into the state. */
  refresh = async (): Promise<void> => {
    try {
      const counts = await countQueue();
      this.setState(counts);
    } catch {
      // IndexedDB not available (private mode, SSR): keep the old counts
    }
  };

  private notifyQueue(): void {
    this.selfNotify = true;
    try {
      notifyQueueUpdated();
    } finally {
      this.selfNotify = false;
    }
  }

  start = (): void => {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.setState({ online: navigator.onLine });

    const onOnline = () => {
      this.setState({ online: true });
      void this.syncNow({ force: true });
    };
    const onOffline = () => this.setState({ online: false });
    const onQueue = () => {
      void this.refresh();
      if (this.selfNotify) return;
      this.scheduleDebouncedPush();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && this.state.online) {
        void this.syncNow({ force: false });
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_QUEUE_EVENT, onQueue);
    document.addEventListener("visibilitychange", onVisible);

    // Cheap check for items that became due (backoff elapsed) or were written
    // straight into the queue by a page.
    const pushTick = window.setInterval(() => {
      void this.refresh();
      if (this.state.online) void this.pushThenMaybePull(false);
    }, PUSH_TICK_MS);
    const pullTick = window.setInterval(() => {
      if (this.state.online && document.visibilityState === "visible") {
        void this.syncNow({ force: false });
      }
    }, PULL_INTERVAL_MS);

    this.teardown = [
      () => window.removeEventListener("online", onOnline),
      () => window.removeEventListener("offline", onOffline),
      () => window.removeEventListener(SYNC_QUEUE_EVENT, onQueue),
      () => document.removeEventListener("visibilitychange", onVisible),
      () => window.clearInterval(pushTick),
      () => window.clearInterval(pullTick),
      () => {
        if (this.debounceId !== null) window.clearTimeout(this.debounceId);
        this.debounceId = null;
      },
    ];

    void this.bootstrap();
  };

  stop = (): void => {
    if (!this.started) return;
    this.started = false;
    this.teardown.forEach((fn) => fn());
    this.teardown = [];
  };

  private async bootstrap(): Promise<void> {
    try {
      const row = await offlineDb.meta.get(LAST_PULL_KEY);
      if (typeof row?.value === "string") {
        this.setState({ lastSyncedAt: row.value });
      }
    } catch {
      // no IndexedDB
    }
    await this.refresh();
    if (this.state.online) await this.syncNow({ force: false });
  }

  private scheduleDebouncedPush(): void {
    if (typeof window === "undefined") return;
    if (this.debounceId !== null) window.clearTimeout(this.debounceId);
    this.debounceId = window.setTimeout(() => {
      this.debounceId = null;
      if (this.state.online) void this.pushThenMaybePull(false);
    }, DEBOUNCE_MS);
  }

  /** Push; pull only when the push moved something (the server state changed). */
  private async pushThenMaybePull(force: boolean): Promise<void> {
    if (this.cycle) return;
    const result = await this.pushQueue({ force });
    if (result.synced > 0 && !result.fatal) await this.pullAll();
  }

  /**
   * Full cycle: push the queue, then pull deltas. `force` ignores backoff
   * (user pressed "Sync now" or the connection came back).
   */
  syncNow = (opts: { force?: boolean } = { force: true }): Promise<{
    synced: number;
    errors: number;
  }> => {
    if (this.cycle) return this.cycle;
    this.cycle = (async () => {
      try {
        const pushed = await this.pushQueue({ force: opts.force ?? true });
        if (!pushed.fatal) await this.pullAll();
        return { synced: pushed.synced, errors: pushed.errors };
      } finally {
        this.cycle = null;
      }
    })();
    return this.cycle;
  };

  pushQueue = async (opts: { force?: boolean } = {}): Promise<PushResult> => {
    const none: PushResult = { synced: 0, errors: 0, fatal: false };
    if (typeof window === "undefined" || this.pushing) return none;
    if (!navigator.onLine || !hasSession()) return none;

    this.pushing = true;
    this.updateSyncing();
    try {
      const out = await withLock("deepkhata-sync-push", () =>
        this.doPush(opts.force ?? false),
      );
      return out ?? none;
    } finally {
      this.pushing = false;
      this.updateSyncing();
      await this.refresh();
    }
  };

  private async doPush(force: boolean): Promise<PushResult> {
    await recoverStaleSyncing(Date.now());
    const due = await loadDueItems(Date.now(), force);
    let synced = 0;
    let errors = 0;
    let fatal = false;
    this.pushError = null;

    for (let i = 0; i < due.length; i += BATCH_SIZE) {
      const chunk = due.slice(i, i + BATCH_SIZE);
      const startedAt = new Date().toISOString();
      await Promise.all(
        chunk.map((item) =>
          offlineDb.syncQueue.update(item.id, {
            status: "syncing",
            syncStartedAt: startedAt,
          }),
        ),
      );
      await this.refresh();

      let results: BatchResult[] | null = null;
      let failure: { message: string; auth: boolean } | null = null;
      try {
        const res = await syncFetch("/sync/batch", {
          method: "POST",
          body: JSON.stringify({
            items: chunk.map(({ id, type, payload, createdAt }) => ({
              id,
              type,
              payload,
              createdAt,
            })),
          }),
        });
        if (res.status === 401 || res.status === 403) {
          failure = {
            message: "Session expired. Please sign in again to sync.",
            auth: true,
          };
        } else if (!res.ok) {
          throw new SyncHttpError(res.status);
        } else {
          const data = (await res.json()) as { results?: BatchResult[] };
          results = data.results ?? [];
        }
      } catch (err) {
        failure = { message: messageOf(err, "Network sync failed"), auth: false };
      }

      if (failure || !results) {
        // Nothing was decided by the server: back off (or pause on auth).
        const now = Date.now();
        await Promise.all(
          chunk.map((item) =>
            offlineDb.syncQueue.update(
              item.id,
              failure?.auth
                ? authPausePatch(now, failure.message)
                : retryPatch(item, now, failure?.message ?? "Sync failed"),
            ),
          ),
        );
        errors += chunk.length;
        fatal = true;
        this.pushError = failure?.message ?? "Sync failed";
        this.publishError();
        break;
      }

      const applied = await this.applyResults(chunk, results);
      synced += applied.synced;
      errors += applied.errors;
    }

    if (!fatal) this.publishError();
    if (synced > 0 || errors > 0) this.notifyQueue();
    return { synced, errors, fatal };
  }

  private async applyResults(
    chunk: SyncQueueItem[],
    results: BatchResult[],
  ): Promise<{ synced: number; errors: number }> {
    const byId = new Map(results.map((r) => [r.id, r]));
    const now = Date.now();
    const syncedIds: string[] = [];
    let errors = 0;
    for (const item of chunk) {
      const act = resultAction(item, byId.get(item.id), now);
      if (act.action === "delete") {
        syncedIds.push(item.id);
        continue;
      }
      await offlineDb.syncQueue.update(item.id, act.patch);
      if (act.patch.status === "failed" || act.patch.status === "conflict") {
        errors++;
      }
    }
    if (syncedIds.length) await offlineDb.syncQueue.bulkDelete(syncedIds);
    return { synced: syncedIds.length, errors };
  }

  pullAll = async (): Promise<boolean> => {
    if (typeof window === "undefined" || this.pulling) return false;
    if (!navigator.onLine || !hasSession()) return false;

    this.pulling = true;
    this.updateSyncing();
    try {
      const ran = await withLock("deepkhata-sync-pull", async () => {
        await pullAllEntities(getActiveBranchId());
        return true;
      });
      if (ran) {
        const at = new Date().toISOString();
        await offlineDb.meta.put({ key: LAST_PULL_KEY, value: at });
        this.pullError = null;
        this.setState({ lastSyncedAt: at });
      }
      this.publishError();
      return Boolean(ran);
    } catch (err) {
      this.pullError =
        err instanceof SyncHttpError && (err.status === 401 || err.status === 403)
          ? "Session expired. Please sign in again to sync."
          : messageOf(err, "Could not refresh data");
      this.publishError();
      return false;
    } finally {
      this.pulling = false;
      this.updateSyncing();
    }
  };

  /** User chose "Retry" on a failed/conflict item. */
  retryItem = async (id: string): Promise<boolean> => {
    const ok = await retryItem(id);
    await this.refresh();
    return ok;
  };

  /** User chose "Discard" on a failed/conflict item. */
  discardItem = async (id: string): Promise<boolean> => {
    const ok = await discardItem(id);
    await this.refresh();
    return ok;
  };
}

export const syncEngine = new SyncEngine();
