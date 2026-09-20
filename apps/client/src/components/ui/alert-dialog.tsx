"use client";

import { X, AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";

type AlertDialogProps = {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  confirming?: boolean;
  onConfirm?: () => void | Promise<void>;
  onClose: () => void;
};

export default function AlertDialog({
  isOpen,
  title,
  description,
  icon,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  destructive = true,
  confirming = false,
  onConfirm,
  onClose,
}: AlertDialogProps) {
  if (!isOpen) return null;

  const isMessageOnly = !onConfirm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="px-6 pt-6 pb-2 flex items-start gap-4">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              isMessageOnly
                ? "bg-blue-100 text-blue-700"
                : destructive
                  ? "bg-rose-100 text-rose-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {icon || (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {title}
            </h2>
            <div className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {description}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors shrink-0 disabled:opacity-50"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 pt-4 flex gap-2.5 justify-end bg-slate-50/70 border-t border-slate-200 mt-4 rounded-b-3xl">
          {isMessageOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all"
            >
              OK
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={confirming}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => void onConfirm()}
                disabled={confirming}
                className={`px-5 py-2 text-sm font-bold text-white rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 ${
                  destructive
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {confirming
                  ? "Please wait..."
                  : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}