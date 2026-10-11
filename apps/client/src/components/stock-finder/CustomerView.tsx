"use client";

import { X } from "lucide-react";
import {
  CONDITIONS,
  CONDITION_LABELS,
  formatRs,
  type StockResult,
} from "@/lib/stock-finder";

interface Props {
  result: StockResult;
  onClose: () => void;
}

export default function CustomerView({ result, onClose }: Props) {
  const own = result.branches.find((b) => b.isOwnBranch);
  const ownAvailable = own?.available ?? 0;
  const other = result.branches.find((b) => !b.isOwnBranch && b.available > 0);
  const shown = ownAvailable > 0 ? own : other;

  return (
    <div
      data-testid="customer-view"
      className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 text-center gap-8"
    >
      <button
        type="button"
        data-testid="customer-view-close"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 p-3 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
      >
        <X className="w-8 h-8" />
      </button>
      <h1 className="text-5xl sm:text-7xl font-black text-slate-900 leading-tight">
        {result.name}
      </h1>
      {shown ? (
        <div className="text-3xl sm:text-5xl font-bold text-slate-700 space-y-2">
          {CONDITIONS.filter((c) => (shown.byCondition[c] ?? 0) > 0).map((c) => (
            <div key={c}>
              {CONDITION_LABELS[c]} ×{shown.byCondition[c]}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-3xl sm:text-5xl font-bold text-slate-500">
          Stock available nahi
        </div>
      )}
      <div className="text-6xl sm:text-8xl font-black text-emerald-700">
        {formatRs(result.salePrice)}
      </div>
      {shown && (
        <div className="text-3xl sm:text-5xl font-bold text-blue-700">
          {ownAvailable > 0
            ? "Yahan available"
            : `${shown.branchName} se mangwa sakte hain`}
        </div>
      )}
    </div>
  );
}
