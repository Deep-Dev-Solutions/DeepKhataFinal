"use client";

import React, { useState, useEffect } from "react";
import { AlertOctagon, RefreshCw, Trash2, FileText, CheckCircle2, X } from "lucide-react";
import { offlineDb, type SyncQueueItem, type LocalInstance } from "@/lib/db";
import { syncEngine } from "@/lib/sync/engine";

interface ConflictDialogProps {
  item: SyncQueueItem | null;
  onClose: () => void;
  onResolved: () => void;
}

export default function ConflictDialog({
  item,
  onClose,
  onResolved,
}: ConflictDialogProps) {
  const [availableInstances, setAvailableInstances] = useState<LocalInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!item) return;

    // If it's an order with items, find available replacement instances from Dexie
    const loadAvailable = async () => {
      try {
        const payload = item.payload as any;
        const items = payload?.items || payload?.orderItems || [];
        const productIds = items.map((i: any) => i.productId).filter(Boolean);

        if (productIds.length > 0) {
          const instances = await offlineDb.instances
            .filter((inst) => productIds.includes(inst.productId) && inst.status === "AVAILABLE")
            .toArray();
          setAvailableInstances(instances);
          if (instances.length > 0) {
            setSelectedInstanceId(instances[0].id);
          }
        }
      } catch {
        setAvailableInstances([]);
      }
    };

    void loadAvailable();
  }, [item]);

  if (!item) return null;

  // Option 1: Pick another instance and retry
  const handlePickAnotherInstance = async () => {
    if (!selectedInstanceId) return;
    setIsSubmitting(true);
    try {
      const payload = { ...(item.payload as Record<string, any>) };
      if (Array.isArray(payload.items) && payload.items.length > 0) {
        payload.items[0].instanceId = selectedInstanceId;
      }
      await offlineDb.syncQueue.update(item.id, {
        payload,
        status: "pending",
        attempts: 0,
        lastError: undefined,
        nextAttemptAt: undefined,
        syncStartedAt: undefined,
      });
      await syncEngine.syncNow({ force: true });
      onResolved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Option 2: Convert to estimate (remove sold instance requirement)
  const handleConvertToEstimate = async () => {
    setIsSubmitting(true);
    try {
      const payload = { ...(item.payload as Record<string, any>) };
      payload.status = "ESTIMATE";
      if (Array.isArray(payload.items)) {
        payload.items = payload.items.map((i: any) => ({
          ...i,
          instanceId: null,
        }));
      }
      await offlineDb.syncQueue.update(item.id, {
        payload,
        status: "pending",
        attempts: 0,
        lastError: undefined,
        nextAttemptAt: undefined,
        syncStartedAt: undefined,
      });
      await syncEngine.syncNow({ force: true });
      onResolved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Option 3: Discard / Cancel line
  const handleDiscard = async () => {
    setIsSubmitting(true);
    try {
      await syncEngine.discardItem(item.id);
      onResolved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="conflict-dialog"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertOctagon className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-sm">Sync Conflict Resolution</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">Server rejected this sale item:</p>
            <p className="text-amber-800 font-mono text-[11px] break-words">
              {item.lastError || "Instance is already sold or reserved by another transaction."}
            </p>
          </div>

          <p className="text-xs text-slate-600">
            Choose how to resolve this conflict. The queued write will not be dropped silently.
          </p>

          <div className="space-y-3 pt-1">
            {/* Action 1: Pick another instance */}
            {availableInstances.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                    Replace with another available unit
                  </span>
                  <button
                    type="button"
                    onClick={handlePickAnotherInstance}
                    disabled={isSubmitting}
                    data-testid="conflict-replace-instance"
                    className="text-xs font-semibold px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Replace & Retry
                  </button>
                </div>
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {availableInstances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      Unit {inst.id.slice(0, 8)} ({inst.condition || "Working"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action 2: Convert to Estimate */}
            <div className="border border-slate-200 rounded-xl p-3.5 flex items-center justify-between hover:border-blue-300 transition-colors">
              <div>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Convert to Estimate / Quotation
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Keeps the customer order details but releases instance allocation.
                </p>
              </div>
              <button
                type="button"
                onClick={handleConvertToEstimate}
                disabled={isSubmitting}
                data-testid="conflict-convert-estimate"
                className="text-xs font-semibold px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              >
                Convert
              </button>
            </div>

            {/* Action 3: Discard */}
            <div className="border border-slate-200 rounded-xl p-3.5 flex items-center justify-between hover:border-rose-300 transition-colors">
              <div>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  Cancel Line / Discard Sale
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Safely remove this queued item without affecting other sales.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSubmitting}
                data-testid="conflict-discard-item"
                className="text-xs font-semibold px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
