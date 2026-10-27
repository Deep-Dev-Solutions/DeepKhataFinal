"use client";

import { useState, useMemo } from "react";
import {
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

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

const textareaClass =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-body text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

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

  const denominationTotal = useMemo(() => {
    const notesTotal = Object.entries(counts).reduce((sum, [denom, count]) => {
      return sum + Number(denom) * (Number(count) || 0);
    }, 0);
    return notesTotal + (Number(coins) || 0);
  }, [counts, coins]);

  const actualCash = useDenominations
    ? denominationTotal
    : Number(manualCash) || 0;
  const difference = actualCash - expectedCash;

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
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-testid="close-register-modal"
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-brand-700" />
          Close Register & Reconcile
        </span>
      }
      description="Count physical drawer cash; the end-of-day Z-Report is recorded and locked."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            data-testid="close-register-submit"
            type="button"
            variant="danger"
            loading={submitting}
            onClick={handleSubmit}
          >
            Confirm & Close Register
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-brand-700 p-3 text-white">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium uppercase tracking-wide text-brand-100">
              System expected cash
            </span>
            <span className="rounded bg-brand-800 px-1.5 py-0.5 font-mono text-[10px] text-brand-100">
              Live ledger
            </span>
          </div>
          <p className="mt-0.5 font-mono text-heading font-semibold">
            PKR {expectedCash.toLocaleString()}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-brand-600 pt-2 text-caption">
            <div>
              <div className="text-brand-200">Opening float</div>
              <div className="font-semibold">
                PKR {openingBalance.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-brand-200">Cash sales (+)</div>
              <div className="font-semibold">
                +PKR {cashSales.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-brand-200">Cash expenses (−)</div>
              <div className="font-semibold">
                −PKR {cashExpenses.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="flex items-center gap-1.5 text-body font-semibold text-gray-900">
            <Coins className="h-4 w-4 text-gray-500" />
            Physical Cash Count
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={useDenominations ? "primary" : "secondary"}
              className="h-6 px-2 text-caption"
              onClick={() => setUseDenominations(true)}
            >
              Denominations
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="close-register-mode-total"
              variant={!useDenominations ? "primary" : "secondary"}
              className="h-6 px-2 text-caption"
              onClick={() => setUseDenominations(false)}
            >
              Total Sum Only
            </Button>
          </div>
        </div>

        {useDenominations ? (
          <div className="space-y-2">
            <p className="text-caption text-gray-500">
              Count each currency note denomination in the drawer:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DENOMINATIONS.map(({ value, label }) => (
                <div
                  key={value}
                  className="rounded-md border border-border bg-gray-50 p-2"
                >
                  <div className="mb-1 flex items-center justify-between text-caption font-semibold text-gray-700">
                    <span>{label}</span>
                    <span className="font-normal text-gray-400">x</span>
                  </div>
                  <Input
                    size="sm"
                    type="number"
                    min="0"
                    value={counts[value] === 0 ? "" : counts[value]}
                    onChange={(e) => handleCountChange(value, e.target.value)}
                    placeholder="0"
                    className="text-center font-mono font-semibold"
                  />
                  <div className="mt-1 text-right font-mono text-caption text-gray-500">
                    = Rs {(value * (counts[value] || 0)).toLocaleString()}
                  </div>
                </div>
              ))}

              <div className="rounded-md border border-border bg-gray-50 p-2">
                <div className="mb-1 flex items-center justify-between text-caption font-semibold text-gray-700">
                  <span>Coins / Change</span>
                  <span className="font-normal text-gray-400">PKR</span>
                </div>
                <Input
                  size="sm"
                  type="number"
                  min="0"
                  value={coins === 0 ? "" : coins}
                  onChange={(e) =>
                    setCoins(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  placeholder="0"
                  className="text-center font-mono font-semibold"
                />
                <div className="mt-1 text-right font-mono text-caption text-gray-500">
                  = Rs {(coins || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">
              Total Physical Cash Counted (PKR)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-gray-400">
                PKR
              </span>
              <Input
                data-testid="close-register-counted"
                type="number"
                min="0"
                required
                value={manualCash}
                onChange={(e) => setManualCash(e.target.value)}
                placeholder="e.g. 15000"
                className="pl-12 font-mono font-semibold"
              />
            </div>
          </div>
        )}

        <div
          data-testid="close-register-variance"
          className={`rounded-md border p-3 transition-all ${
            difference === 0
              ? "border-success/30 bg-success-bg"
              : difference < 0
                ? "border-danger/30 bg-danger-bg"
                : "border-warning/40 bg-warning-bg"
          }`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div
              className={`flex items-center gap-1.5 text-body font-semibold ${
                difference === 0
                  ? "text-success-fg"
                  : difference < 0
                    ? "text-danger-fg"
                    : "text-warning-fg"
              }`}
            >
              {difference === 0 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>
                {difference === 0
                  ? "Drawer is Perfectly Balanced"
                  : difference < 0
                    ? "Cash Shortage Detected"
                    : "Cash Overage Detected"}
              </span>
            </div>
            <span className="whitespace-nowrap rounded border border-border bg-card px-1.5 py-0.5 font-mono text-caption font-semibold text-gray-700">
              Counted: PKR {actualCash.toLocaleString()}
            </span>
          </div>

          <p className="text-caption text-gray-600">
            {difference === 0 ? (
              <>
                Counted cash exactly matches expected drawer cash of PKR{" "}
                {expectedCash.toLocaleString()}. Zero discrepancy.
              </>
            ) : difference < 0 ? (
              <>
                Physical drawer is{" "}
                <strong className="font-semibold text-danger-fg">
                  SHORT by PKR {Math.abs(difference).toLocaleString()}
                </strong>{" "}
                against expected cash (PKR {expectedCash.toLocaleString()}).
              </>
            ) : (
              <>
                Physical drawer has an{" "}
                <strong className="font-semibold text-warning-fg">
                  overage of PKR {difference.toLocaleString()}
                </strong>{" "}
                over expected cash (PKR {expectedCash.toLocaleString()}).
              </>
            )}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">
            Reconciliation Notes / Handover Remarks
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 50 PKR short due to loose change shortage during evening rush..."
            className={textareaClass}
          />
        </div>
      </div>
    </Modal>
  );
}
