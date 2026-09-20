"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    info: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message }]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast],
  );

  const toast = {
    success: (msg: string) => showToast(msg, "success"),
    error: (msg: string) => showToast(msg, "error"),
    warning: (msg: string) => showToast(msg, "warning"),
    info: (msg: string) => showToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}
      {/* Toast Container */}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none sm:px-0"
        style={{ zIndex: 9999 }}
      >
        {toasts.map((t) => {
          let bgClass = "bg-slate-900 text-white border-slate-800 shadow-2xl";
          let icon = <Info className="w-5 h-5 text-blue-400 shrink-0" />;

          if (t.type === "success") {
            bgClass =
              "bg-emerald-50 text-emerald-950 border-emerald-300 shadow-2xl ring-1 ring-emerald-500/20";
            icon = (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            );
          } else if (t.type === "error") {
            bgClass =
              "bg-rose-50 text-rose-950 border-rose-300 shadow-2xl ring-1 ring-rose-500/20";
            icon = <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
          } else if (t.type === "warning") {
            bgClass =
              "bg-amber-50 text-amber-950 border-amber-300 shadow-2xl ring-1 ring-amber-500/30";
            icon = (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            );
          }

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${bgClass}`}
            >
              {icon}
              <div className="flex-1 text-xs sm:text-sm font-semibold leading-snug break-words">
                {t.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-0.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer text-slate-600 hover:text-slate-900"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
