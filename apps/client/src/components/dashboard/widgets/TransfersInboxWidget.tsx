"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  actOnTransfer,
  fetchTransfers,
  transferAge,
  type StockTransfer,
  type TransferAction,
} from "@/lib/transfers";

const ACTION_DONE: Record<TransferAction, string> = {
  dispatch: "Transfer dispatch ho gaya",
  receive: "Transfer receive ho gaya",
  cancel: "Transfer cancel ho gaya",
};

function linesSummary(t: StockTransfer): string {
  const lines = t.lines ?? [];
  if (lines.length === 0) return "No items";
  const first = lines
    .slice(0, 2)
    .map((l) => `${l.productName} x${l.quantity}`)
    .join(", ");
  return lines.length > 2 ? `${first} +${lines.length - 2} more` : first;
}

export default function TransfersInboxWidget() {
  const { activeBranchId } = useAuth();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const canManage = hasPermission("manage:transfers");
  const [items, setItems] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchTransfers(activeBranchId));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (id: string, action: TransferAction) => {
    setBusyId(id);
    try {
      await actOnTransfer(id, action, activeBranchId);
      toast.success(ACTION_DONE[action]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const send = items.filter(
    (t) =>
      t.status === "REQUESTED" &&
      (!activeBranchId || t.fromBranch?.id === activeBranchId),
  );
  const incoming = items.filter(
    (t) =>
      t.status === "DISPATCHED" &&
      (!activeBranchId || t.toBranch?.id === activeBranchId),
  );

  const renderRow = (t: StockTransfer) => {
    const busy = busyId === t.id;
    const since =
      t.status === "DISPATCHED" ? t.dispatchedAt ?? t.requestedAt : t.requestedAt;
    const btn =
      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";
    return (
      <li
        key={t.id}
        data-testid="transfer-row"
        data-transfer-id={t.id}
        data-status={t.status}
        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {t.fromBranch?.name} → {t.toBranch?.name}
          </p>
          <p className="truncate text-xs text-slate-500">
            {linesSummary(t)}
            {transferAge(since) ? ` · ${transferAge(since)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && t.status === "REQUESTED" && (
            <button
              type="button"
              data-testid="transfer-dispatch"
              disabled={busy}
              onClick={() => act(t.id, "dispatch")}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}
            >
              Dispatch
            </button>
          )}
          {canManage && t.status === "DISPATCHED" && (
            <button
              type="button"
              data-testid="transfer-receive"
              disabled={busy}
              onClick={() => act(t.id, "receive")}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              Receive
            </button>
          )}
          {canManage && t.status === "REQUESTED" && (
            <button
              type="button"
              data-testid="transfer-cancel"
              disabled={busy}
              onClick={() => act(t.id, "cancel")}
              className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`}
            >
              Cancel
            </button>
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, rows: StockTransfer[]) =>
    rows.length > 0 && (
      <div>
        <p className="bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {title} ({rows.length})
        </p>
        <ul className="divide-y divide-slate-100">{rows.map(renderRow)}</ul>
      </div>
    );

  return (
    <div
      data-testid="transfers-widget"
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-blue-600" /> Transfers
        </h2>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : send.length + incoming.length === 0 ? (
        <p
          data-testid="transfers-empty"
          className="px-4 py-6 text-center text-sm text-slate-500"
        >
          Koi transfer pending nahi
        </p>
      ) : (
        <>
          {section("Bhejna hai", send)}
          {section("Aana hai", incoming)}
        </>
      )}
    </div>
  );
}
