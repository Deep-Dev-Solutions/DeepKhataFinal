"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import ModalShell, { inputCls } from "./ModalShell";
import {
  CONDITIONS,
  CONDITION_LABELS,
  type StockCondition,
  type StockResult,
  type TransferPayload,
} from "@/lib/stock-finder";

interface Props {
  result: StockResult;
  onClose: () => void;
  onSubmit: (payload: TransferPayload) => Promise<void>;
}

export default function TransferModal({ result, onClose, onSubmit }: Props) {
  const sources = result.branches.filter((b) => !b.isOwnBranch && b.available > 0);

  const [fromBranchId, setFromBranchId] = useState(sources[0]?.branchId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<StockCondition | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const source = sources.find((b) => b.branchId === fromBranchId);
  const max = source?.available ?? 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return setError("Branch chunein.");
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > max) {
      return setError(`Quantity 1 se ${max} ke darmiyan honi chahiye.`);
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        fromBranchId: source.branchId,
        productId: result.productId,
        quantity: q,
        ...(condition ? { condition } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      testId="transfer-modal"
      title="Doosri branch se mangwayein"
      subtitle={result.name}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <label className="block text-sm font-semibold text-slate-700">
        Kis branch se
        <select
          data-testid="transfer-from-branch"
          value={fromBranchId}
          onChange={(e) => {
            setFromBranchId(e.target.value);
            setQuantity("1");
            setCondition("");
          }}
          className={inputCls}
        >
          {sources.map((b) => (
            <option key={b.branchId} value={b.branchId}>
              {b.branchName} ({b.available})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Quantity
        <input
          data-testid="transfer-qty"
          type="number"
          min={1}
          max={max}
          step={1}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Condition (optional)
        <select
          data-testid="transfer-condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value as StockCondition | "")}
          className={inputCls}
        >
          <option value="">Koi bhi</option>
          {CONDITIONS.filter((c) => (source?.byCondition[c] ?? 0) > 0).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]} ({source?.byCondition[c]})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Note (optional)
        <textarea
          data-testid="transfer-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
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
          data-testid="transfer-submit"
          type="submit"
          disabled={submitting || !source}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "Bhej rahe hain..." : "Request bhejein"}
        </button>
      </div>
    </ModalShell>
  );
}
