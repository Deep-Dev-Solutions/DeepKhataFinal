"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { SyncQueueItem } from "@/lib/db";
import { syncEngine } from "@/lib/sync/engine";
import { SYNC_QUEUE_EVENT, listAttentionItems } from "@/lib/sync/queue";
import { useSyncState } from "./useSyncState";

const TYPE_LABELS: Record<SyncQueueItem["type"], string> = {
  CREATE_ORDER: "Sale",
  RECORD_PAYMENT: "Payment",
  CREATE_KHATA_ENTRY: "Khata entry",
  UPSERT_CUSTOMER: "Customer",
  CREATE_EXPENSE: "Expense",
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Header badge: online/offline/syncing, items needing attention, "Sync now". */
export default function SyncStatus() {
  const state = useSyncState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the list in step with the queue while the panel is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = () => {
      listAttentionItems()
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    };
    load();
    window.addEventListener(SYNC_QUEUE_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_QUEUE_EVENT, load);
    };
  }, [open, state.needsAttention]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const visibleOpen = open && state.needsAttention > 0;
  const mode = !state.online
    ? "offline"
    : state.syncing
      ? "syncing"
      : "online";
  const lastSynced = formatTime(state.lastSyncedAt);

  let label: string;
  if (mode === "offline") {
    label = state.pending > 0 ? `Offline, ${state.pending} queued` : "Offline";
  } else if (mode === "syncing") {
    label = state.pending > 0 ? `Syncing ${state.pending}` : "Syncing";
  } else {
    label = state.pending > 0 ? `Online, ${state.pending} waiting` : "Online";
  }

  const tone =
    mode === "offline"
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : mode === "syncing"
        ? "bg-blue-50 border-blue-200 text-blue-700"
        : "bg-emerald-50 border-emerald-200/80 text-emerald-700";

  return (
    <div
      ref={rootRef}
      className="relative flex items-center gap-1.5 print:hidden"
      data-testid="sync-status"
    >
      <div
        className={`flex items-center gap-1.5 border px-2.5 py-1.5 rounded-xl text-xs font-semibold ${tone}`}
        title={
          state.lastError
            ? `Last problem: ${state.lastError}`
            : lastSynced
              ? `Last synced ${lastSynced}`
              : undefined
        }
      >
        {mode === "offline" ? (
          <WifiOff className="w-3.5 h-3.5" />
        ) : (
          <Wifi className="w-3.5 h-3.5" />
        )}
        <span data-testid="sync-status-state" data-state={mode}>
          {label}
        </span>
        {lastSynced && mode === "online" && state.pending === 0 && (
          <span
            className="hidden lg:inline font-normal opacity-70"
            data-testid="sync-last-synced"
          >
            {lastSynced}
          </span>
        )}
      </div>

      {state.needsAttention > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={visibleOpen}
          data-testid="sync-attention-count"
          className="flex items-center gap-1.5 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{state.needsAttention} need attention</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => void syncEngine.syncNow({ force: true })}
        disabled={!state.online || state.syncing}
        data-testid="sync-now"
        className="flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${state.syncing ? "animate-spin" : ""}`}
        />
        <span className="hidden sm:inline">Sync now</span>
      </button>

      {visibleOpen && (
        <div
          data-testid="sync-attention-panel"
          className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-[70]"
        >
          <p className="text-xs font-bold text-slate-900 mb-2">
            These entries did not sync
          </p>
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                data-testid="sync-attention-item"
                data-item-id={item.id}
                data-status={item.status}
                className="border border-slate-200 rounded-xl p-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      item.status === "conflict"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-slate-600 break-words">
                  {item.lastError || "No details from the server."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid="sync-retry"
                    onClick={() => void syncEngine.retryItem(item.id)}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    data-testid="sync-discard"
                    onClick={() => void syncEngine.discardItem(item.id)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                  >
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
