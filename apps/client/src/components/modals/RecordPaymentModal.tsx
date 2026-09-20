"use client";

import { useState, useEffect } from "react";
import { X, Wallet, Banknote, CheckCircle2, AlertCircle } from "lucide-react";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  pendingAmount: number;
  onSuccess: () => void;
}

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export default function RecordPaymentModal({
  isOpen,
  onClose,
  orderId,
  pendingAmount,
  onSuccess,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState("CASH");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 🟢 AUTO-FILL: Whenever the modal opens, pre-fill the exact pending amount
  useEffect(() => {
    if (isOpen) {
      setAmount(pendingAmount.toString());
      setError("");
      setMethod("CASH");
    }
  }, [isOpen, pendingAmount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const paymentAmount = Number(amount);

    // 🟢 FRONTEND VALIDATION (Anti-Fraud & Math Checks)
    if (!paymentAmount || paymentAmount <= 0) {
      return setError("Please enter a valid amount.");
    }
    if (paymentAmount > pendingAmount) {
      return setError(
        `Amount cannot exceed the pending balance of Rs. ${pendingAmount.toLocaleString()}`,
      );
    }

    setIsSubmitting(true);

    try {
      // Send the payment to the backend
      const response = await fetch(`${API_BASE_URL}/order/recordpayment`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          orderId,
          amount: paymentAmount,
          method,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to record payment.");
      }

      // Success!
      setIsSubmitting(false);
      onSuccess(); // This will trigger refreshOrder() in the parent component!
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 🟢 Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 🟢 Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Record Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Log an incoming payment for this order.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Pending Notice */}
        <div className="bg-rose-50 border-b border-rose-100 p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-700">
            Outstanding Balance:
          </span>
          <span className="text-lg font-black text-rose-700 tracking-tight">
            Rs. {pendingAmount.toLocaleString()}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              Amount Received
              <button
                type="button"
                onClick={() => setAmount(pendingAmount.toString())}
                className="text-[10px] text-blue-600 hover:underline"
              >
                Pay in Full
              </button>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-semibold text-sm">
                Rs.
              </span>
              <input
                type="number"
                required
                max={pendingAmount} // HTML fallback validation
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-900 shadow-sm"
              />
            </div>
          </div>

          {/* Payment Method Select */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Payment Method
            </label>
            <div className="relative">
              <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white appearance-none cursor-pointer shadow-sm"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer</option>
                <option value="ONLINE">Online Payment</option>
              </select>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amount || Number(amount) <= 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Processing..." : "Confirm Payment"}
              {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
