"use client";

import { useState, useEffect } from "react";
import { Wallet, CheckCircle2, AlertCircle } from "lucide-react";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  pendingAmount: number;
  onSuccess: () => void;
}

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { enqueue } from "@/lib/sync/queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

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

  // AUTO-FILL: Whenever the modal opens, pre-fill the exact pending amount
  useEffect(() => {
    if (isOpen) {
      setAmount(pendingAmount.toString());
      setError("");
      setMethod("CASH");
    }
  }, [isOpen, pendingAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const paymentAmount = Number(amount);

    // FRONTEND VALIDATION (Anti-Fraud & Math Checks)
    if (!paymentAmount || paymentAmount <= 0) {
      return setError("Please enter a valid amount.");
    }
    if (paymentAmount > pendingAmount) {
      return setError(
        `Amount cannot exceed the pending balance of Rs. ${pendingAmount.toLocaleString()}`,
      );
    }

    setIsSubmitting(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const paymentId = crypto.randomUUID();
      await enqueue("RECORD_PAYMENT", {
        orderId,
        amount: paymentAmount,
        method,
      }, paymentId);
      setIsSubmitting(false);
      onSuccess();
      return;
    }

    try {
      // Send the payment to the backend
      const response = await fetch(`${API_BASE_URL}/order/recordpayment`, {
        credentials: "include",
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
    } catch (err: unknown) {
      // If network failure, queue for offline sync
      const isNetworkErr = err instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
      if (isNetworkErr) {
        const paymentId = crypto.randomUUID();
        await enqueue("RECORD_PAYMENT", {
          orderId,
          amount: paymentAmount,
          method,
        }, paymentId);
        setIsSubmitting(false);
        onSuccess();
        return;
      }
      setError((err instanceof Error ? err.message : "Something went wrong.") || "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-testid="record-payment-modal"
      title="Record Payment"
      description="Log an incoming payment for this order."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="record-payment-submit"
            type="submit"
            form="record-payment-form"
            loading={isSubmitting}
            disabled={isSubmitting || !amount || Number(amount) <= 0}
          >
            {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
            {isSubmitting ? "Processing..." : "Confirm Payment"}
          </Button>
        </>
      }
    >
      {/* Current Pending Notice */}
      <div className="mb-3 flex items-center justify-between rounded-md border border-danger/30 bg-danger-bg px-3 py-2">
        <span className="text-body font-medium text-danger-fg">
          Outstanding Balance:
        </span>
        <span className="text-subtitle font-semibold tracking-tight text-danger">
          Rs. {pendingAmount.toLocaleString()}
        </span>
      </div>

      <form id="record-payment-form" onSubmit={handleSubmit} className="space-y-3">
        {/* Amount Input */}
        <div>
          <label className="mb-1 flex items-center justify-between text-caption font-medium text-gray-700">
            Amount Received
            <button
              type="button"
              onClick={() => setAmount(pendingAmount.toString())}
              className="text-caption font-medium text-brand-700 hover:underline"
            >
              Pay in Full
            </button>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body font-medium text-gray-500">
              Rs.
            </span>
            <Input data-testid="record-payment-amount"
              type="number"
              required
              max={pendingAmount} // HTML fallback validation
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="pl-9 font-semibold"
            />
          </div>
        </div>

        {/* Payment Method Select */}
        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">
            Payment Method
          </label>
          <div className="relative">
            <Wallet className="pointer-events-none absolute left-2.5 top-1/2 z-10 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <Select data-testid="record-payment-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="cursor-pointer pl-9 font-semibold"
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank Transfer</option>
              <option value="ONLINE">Online Payment</option>
            </Select>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
