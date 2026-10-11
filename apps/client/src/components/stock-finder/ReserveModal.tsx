"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import ModalShell, { inputCls } from "./ModalShell";
import {
  CONDITIONS,
  CONDITION_LABELS,
  locationLabel,
  type ReservePayload,
  type StockCondition,
  type StockResult,
} from "@/lib/stock-finder";

interface Props {
  result: StockResult;
  onClose: () => void;
  onSubmit: (payload: ReservePayload) => Promise<void>;
}

export default function ReserveModal({ result, onClose, onSubmit }: Props) {
  const own = result.branches.find((b) => b.isOwnBranch);
  const locations = own?.locations ?? [];

  const [instanceId, setInstanceId] = useState("");
  const [condition, setCondition] = useState<StockCondition | "">("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [hours, setHours] = useState("24");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return setError("Customer ka naam zaroori hai.");
    const h = Number(hours);
    if (!h || h <= 0) return setError("Hours sahi likhein.");
    const payload: ReservePayload = {
      customerName: customerName.trim(),
      ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
      hours: h,
    };
    if (instanceId) {
      payload.instanceId = instanceId;
    } else {
      payload.productId = result.productId;
      if (own) payload.branchId = own.branchId;
      if (condition) payload.condition = condition;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      testId="reserve-modal"
      title="Reserve karein"
      subtitle={result.name}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {locations.length > 0 && (
        <label className="block text-sm font-semibold text-slate-700">
          Unit chunein
          <select
            data-testid="reserve-instance"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className={inputCls}
          >
            <option value="">Koi bhi (condition se)</option>
            {locations.map((l) => (
              <option key={l.instanceId} value={l.instanceId}>
                {CONDITION_LABELS[l.condition]} — {locationLabel(l)}
                {l.serialNumber ? ` — SN ${l.serialNumber}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {!instanceId && (
        <label className="block text-sm font-semibold text-slate-700">
          Condition (optional)
          <select
            data-testid="reserve-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as StockCondition | "")}
            className={inputCls}
          >
            <option value="">Koi bhi</option>
            {CONDITIONS.filter((c) => (own?.byCondition[c] ?? 0) > 0).map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-semibold text-slate-700">
        Customer ka naam
        <input
          data-testid="reserve-customer-name"
          type="text"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Phone (optional)
        <input
          data-testid="reserve-customer-phone"
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Kitne ghante
        <input
          data-testid="reserve-hours"
          type="number"
          min={1}
          step={1}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={inputCls}
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
          data-testid="reserve-submit"
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Reserve"}
        </button>
      </div>
    </ModalShell>
  );
}
