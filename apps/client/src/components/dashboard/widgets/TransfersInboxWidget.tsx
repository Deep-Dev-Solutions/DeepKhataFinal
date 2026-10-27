"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    return (
      <li
        key={t.id}
        data-testid="transfer-row"
        data-transfer-id={t.id}
        data-status={t.status}
        className="flex flex-col gap-2 px-4 py-2.5 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-gray-900">
            {t.fromBranch?.name} → {t.toBranch?.name}
          </p>
          <p className="truncate text-caption text-gray-500">
            {linesSummary(t)}
            {transferAge(since) ? ` · ${transferAge(since)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && t.status === "REQUESTED" && (
            <Button
              type="button"
              size="sm"
              data-testid="transfer-dispatch"
              disabled={busy}
              onClick={() => act(t.id, "dispatch")}
            >
              Dispatch
            </Button>
          )}
          {canManage && t.status === "DISPATCHED" && (
            <Button
              type="button"
              size="sm"
              data-testid="transfer-receive"
              disabled={busy}
              onClick={() => act(t.id, "receive")}
            >
              Receive
            </Button>
          )}
          {canManage && t.status === "REQUESTED" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="transfer-cancel"
              disabled={busy}
              onClick={() => act(t.id, "cancel")}
            >
              Cancel
            </Button>
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, rows: StockTransfer[]) =>
    rows.length > 0 && (
      <div>
        <p className="bg-gray-50 px-4 py-1.5 text-caption font-medium uppercase tracking-wide text-gray-500">
          {title} ({rows.length})
        </p>
        <ul className="divide-y divide-border">{rows.map(renderRow)}</ul>
      </div>
    );

  return (
    <Card data-testid="transfers-widget" className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-2 border-b border-border py-2.5">
        <span className="rounded-md bg-brand-50 p-1.5 text-brand-700">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
        <CardTitle className="text-subtitle">Transfers</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-body text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : send.length + incoming.length === 0 ? (
          <p
            data-testid="transfers-empty"
            className="px-4 py-6 text-center text-body text-gray-500"
          >
            Koi transfer pending nahi
          </p>
        ) : (
          <>
            {section("Bhejna hai", send)}
            {section("Aana hai", incoming)}
          </>
        )}
      </CardContent>
    </Card>
  );
}
