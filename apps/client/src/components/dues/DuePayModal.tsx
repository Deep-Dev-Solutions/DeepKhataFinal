"use client";

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { formatRs, type DueItem } from "@/lib/dues";

interface Props {
  item: DueItem;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
}

export default function DuePayModal({ item, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState(String(item.amountOpen));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return setError("Please enter a valid amount.");
    if (value > item.amountOpen) {
      return setError(`Amount cannot exceed ${formatRs(item.amountOpen)}.`);
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        data-testid="dues-pay-modal"
        onSubmit={handleSubmit}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {item.direction === "RECEIVABLE" ? "Payment mili" : "Payment di"}
            </h2>
            <p className="text-xs text-slate-500">
              {item.partyName} · Baqi {formatRs(item.amountOpen)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Amount
            <input
              data-testid="dues-pay-amount"
              type="number"
              min={0}
              max={item.amountOpen}
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </label>
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              data-testid="dues-pay-submit"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
