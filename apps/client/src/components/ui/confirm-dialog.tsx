"use client";

import { Loader2, AlertTriangle, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  readOnly,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const readOnlyState = useIsReadOnly();
  const activeReadOnly = readOnly ?? readOnlyState;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="px-6 pt-6 pb-2 flex items-start gap-4">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              destructive
                ? "bg-rose-100 text-rose-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {title}
            </h2>
            <div className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 pt-4 flex gap-2.5 justify-end bg-slate-50/70 border-t border-slate-200 mt-4 rounded-b-3xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={loading || activeReadOnly}
              title={
                activeReadOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`px-5 py-2 text-sm font-bold text-white rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 ${
                activeReadOnly
                  ? "cursor-not-allowed bg-slate-400 hover:bg-slate-400"
                  : "cursor-pointer " +
                    (destructive
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-blue-600 hover:bg-blue-700")
              }`}
            >
              {activeReadOnly && <Lock className="w-4 h-4" />}
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading
                ? "Please wait..."
                : activeReadOnly
                  ? "Read-only"
                  : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}