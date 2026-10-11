"use client";

import { Clock, Eye, Send, ShoppingCart, Truck, Bookmark } from "lucide-react";
import {
  conditionSummary,
  formatRs,
  locationLabel,
  sortBranches,
  CONDITION_LABELS,
  type StockResult,
} from "@/lib/stock-finder";

interface Props {
  result: StockResult;
  canReserve: boolean;
  canRequest: boolean;
  onReserve: (r: StockResult) => void;
  onRequest: (r: StockResult) => void;
  onSell: (r: StockResult) => void;
  onCustomerView: (r: StockResult) => void;
}

export default function StockResultCard({
  result,
  canReserve,
  canRequest,
  onReserve,
  onRequest,
  onSell,
  onCustomerView,
}: Props) {
  const branches = sortBranches(result.branches);
  const hasOwn = branches.some((b) => b.isOwnBranch);
  const ownAvailable = branches.find((b) => b.isOwnBranch)?.available ?? 0;
  const otherAvailable = branches.some((b) => !b.isOwnBranch && b.available > 0);

  return (
    <div
      data-testid="stock-result"
      data-product-id={result.productId}
      className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <h2
            data-testid="stock-result-name"
            className="text-lg font-black text-slate-900"
          >
            {result.name}
          </h2>
          <p className="text-xs text-slate-500">
            {result.sku && <span>SKU: {result.sku}</span>}
            {result.sku && result.partNumber && " · "}
            {result.partNumber && <span>Part #: {result.partNumber}</span>}
          </p>
          {result.compatibleWith.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.compatibleWith.map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          {result.aliases.length > 0 && (
            <p className="text-xs text-slate-400">
              Aka: {result.aliases.join(", ")}
            </p>
          )}
        </div>

        <div className="sm:text-right shrink-0 space-y-0.5">
          <div
            data-testid="stock-price-sale"
            className="text-xl font-black text-emerald-700"
          >
            {formatRs(result.salePrice)}
          </div>
          {result.minSalePrice != null && (
            <div data-testid="stock-price-min" className="text-xs text-slate-600">
              Kam se kam: {formatRs(result.minSalePrice)}
            </div>
          )}
          {result.recentSoldPrices.length > 0 && (
            <div className="text-xs text-slate-500">
              Recent:{" "}
              {result.recentSoldPrices.map((p) => formatRs(p)).join(", ")}
            </div>
          )}
          {result.costPrice != null && (
            <div data-testid="stock-price-cost" className="text-xs text-rose-600">
              Cost: {formatRs(result.costPrice)}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {branches.map((b) => (
          <div
            key={b.branchId}
            data-testid="stock-branch-row"
            data-branch-id={b.branchId}
            data-own={b.isOwnBranch ? "true" : "false"}
            className={`rounded-xl border p-3 ${
              b.isOwnBranch
                ? "border-blue-200 bg-blue-50/40"
                : "border-slate-200 bg-slate-50/50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-slate-900">
                {b.branchName}:
              </span>
              <span
                data-testid="stock-branch-available"
                className="font-black text-slate-900"
              >
                {b.available}
              </span>
              {b.available > 0 && (
                <span className="text-slate-600">
                  ({conditionSummary(b.byCondition)})
                </span>
              )}
              {b.isOwnBranch && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800">
                  Yahan
                </span>
              )}
              {b.reserved > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800">
                  <Clock className="w-3 h-3" /> Reserved {b.reserved}
                </span>
              )}
              {b.inTransit > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-indigo-100 text-indigo-800">
                  <Truck className="w-3 h-3" /> In transit {b.inTransit}
                </span>
              )}
            </div>
            {b.isOwnBranch && b.locations && b.locations.length > 0 && (
              <ul className="mt-2 space-y-1">
                {b.locations.map((l) => (
                  <li
                    key={l.instanceId}
                    data-testid="stock-location"
                    data-instance-id={l.instanceId}
                    className="text-xs text-slate-700"
                  >
                    <span className="font-semibold">
                      {CONDITION_LABELS[l.condition]}
                    </span>
                    {" — "}
                    {locationLabel(l)}
                    {l.serialNumber && ` · SN ${l.serialNumber}`}
                    {l.notes && (
                      <span className="text-slate-400"> · {l.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {!hasOwn && (
          <div
            data-testid="stock-branch-row"
            data-branch-id=""
            data-own="true"
            className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-sm"
          >
            <span className="font-bold text-slate-900">Yahan: </span>
            <span
              data-testid="stock-branch-available"
              className="font-black text-slate-900"
            >
              0
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canReserve && (
          <button
            type="button"
            data-testid="stock-action-reserve"
            disabled={ownAvailable <= 0}
            onClick={() => onReserve(result)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Bookmark className="w-4 h-4" /> Reserve
          </button>
        )}
        {canRequest && (
          <button
            type="button"
            data-testid="stock-action-request"
            disabled={!otherAvailable}
            onClick={() => onRequest(result)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" /> Request from branch
          </button>
        )}
        <button
          type="button"
          data-testid="stock-action-sell"
          onClick={() => onSell(result)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <ShoppingCart className="w-4 h-4" /> Sell now
        </button>
        <button
          type="button"
          data-testid="stock-action-customer-view"
          onClick={() => onCustomerView(result)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <Eye className="w-4 h-4" /> Customer view
        </button>
      </div>
    </div>
  );
}
