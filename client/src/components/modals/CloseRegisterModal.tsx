"use client";

import { useState, useMemo } from "react";
import { X, Calculator, AlertTriangle, CheckCircle2, DollarSign, Coins } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  expectedCash: number;
  openingBalance: number;
  cashSales: number;
  cashExpenses: number;
  onConfirmClose: (data: { actualCash: number; notes?: string }) => Promise<void>;
};

const DENOMINATIONS = [
  { value: 5000, label: "Rs 5,000" },
  { value: 1000, label: "Rs 1,000" },
  { value: 500, label: "Rs 500" },
  { value: 100, label: "Rs 100" },
  { value: 50, label: "Rs 50" },
  { value: 20, label: "Rs 20" },
  { value: 10, label: "Rs 10" },
];

export default function CloseRegisterModal({
  isOpen,
  onClose,
  expectedCash,
  openingBalance,
  cashSales,
  cashExpenses,
  onConfirmClose,
}: Props) {
  const [useDenominations, setUseDenominations] = useState(true);
  const [counts, setCounts] = useState<Record<number, number>>({
    5000: 0,
    1000: 0,
    500: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  });
  const [coins, setCoins] = useState<number>(0);
  const [manualCash, setManualCash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Calculate total from denominations
  const denominationTotal = useMemo(() => {
    const notesTotal = Object.entries(counts).reduce((sum, [denom, count]) => {
      return sum + Number(denom) * (Number(count) || 0);
    }, 0);
    return notesTotal + (Number(coins) || 0);
  }, [counts, coins]);

  const actualCash = useDenominations ? denominationTotal : (Number(manualCash) || 0);
  const difference = actualCash - expectedCash;

  if (!isOpen) return null;

  const handleCountChange = (denom: number, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCounts((prev) => ({ ...prev, [denom]: num }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirmClose({
        actualCash,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Close Register & Reconcile (Z-Report)</h2>
              <p className="text-xs text-slate-500">Count physical drawer cash and generate end-of-day summary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Expected Cash KPI Strip */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">System Calculated Expected Cash</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-emerald-400 font-mono">Live Ledger</span>
            </div>
            <div className="text-3xl font-extrabold font-mono tracking-tight text-white">
              PKR {expectedCash.toLocaleString()}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs">
              <div>
                <div className="text-slate-400">Opening Float:</div>
                <div className="font-semibold text-slate-200">PKR {openingBalance.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">Cash Sales (+):</div>
                <div className="font-semibold text-emerald-400">+PKR {cashSales.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">Cash Expenses (-):</div>
                <div className="font-semibold text-rose-400">-PKR {cashExpenses.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Input Mode Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-4 h-4 text-blue-600" />
              Physical Cash Count
            </h3>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setUseDenominations(true)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  useDenominations ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Denominations
              </button>
              <button
                type="button"
                onClick={() => setUseDenominations(false)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  !useDenominations ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Total Sum Only
              </button>
            </div>
          </div>

          {/* Denomination Counter */}
          {useDenominations ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500">Count each currency note denomination in the drawer:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {DENOMINATIONS.map(({ value, label }) => (
                  <div key={value} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                      <span>{label}</span>
                      <span className="text-[10px] font-normal text-slate-400">x</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={counts[value] === 0 ? "" : counts[value]}
                      onChange={(e) => handleCountChange(value, e.target.value)}
                      placeholder="0"
                      className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-300 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-right text-[11px] font-mono text-slate-500 mt-1">
                      = Rs {(value * (counts[value] || 0)).toLocaleString()}
                    </div>
                  </div>
                ))}

                {/* Coins / Small Change */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                    <span>Coins / Change</span>
                    <span className="text-[10px] font-normal text-slate-400">PKR</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={coins === 0 ? "" : coins}
                    onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="0"
                    className="w-full text-center font-mono font-bold text-sm bg-white border border-slate-300 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-right text-[11px] font-mono text-slate-500 mt-1">
                    = Rs {(coins || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Total Physical Cash Counted (PKR)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">PKR</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={manualCash}
                  onChange={(e) => setManualCash(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-lg font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Counted vs Expected Reconciliation Status Card */}
          <div className={`p-4 rounded-2xl border transition-all ${
            difference === 0
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
              : difference < 0
              ? "bg-rose-50/90 border-rose-200 text-rose-950"
              : "bg-amber-50/90 border-amber-200 text-amber-950"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                {difference === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className={`w-5 h-5 shrink-0 ${difference < 0 ? "text-rose-600" : "text-amber-600"}`} />
                )}
                <span>
                  {difference === 0
                    ? "Drawer is Perfectly Balanced"
                    : difference < 0
                    ? "Cash Shortage Detected"
                    : "Cash Overage Detected"}
                </span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full font-bold bg-white/70">
                Counted: PKR {actualCash.toLocaleString()}
              </span>
            </div>

            <div className="text-xs space-y-1">
              {difference === 0 ? (
                <p className="text-emerald-700">Counted cash exactly matches system expected drawer cash of PKR {expectedCash.toLocaleString()}. Zero discrepancy.</p>
              ) : difference < 0 ? (
                <p className="text-rose-800 font-medium">
                  Physical drawer is <strong className="font-bold underline">SHORT by PKR {Math.abs(difference).toLocaleString()}</strong> compared to system expected cash (PKR {expectedCash.toLocaleString()}).
                </p>
              ) : (
                <p className="text-amber-800 font-medium">
                  Physical drawer has an <strong className="font-bold underline">OVERAGE of PKR {difference.toLocaleString()}</strong> over system expected cash (PKR {expectedCash.toLocaleString()}).
                </p>
              )}
            </div>
          </div>

          {/* Staff Closing Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reconciliation Notes / Handover Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 50 PKR short due to loose change shortage during evening rush..."
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            End of Day Z-Report will be recorded and locked.
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? "Closing Shift..." : "Confirm & Close Register"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
