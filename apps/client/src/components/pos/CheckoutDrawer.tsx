"use client";

import { useEffect } from "react";
import {
  X,
  User,
  Phone,
  Store,
  Search,
  Tag,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/context/ToastContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { Customer } from "@/types/api";

/** Today's date in Asia/Karachi plus `days`, formatted YYYY-MM-DD. */
export function addDaysKarachi(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const DUE_CHIPS: Array<{ days: number; label: string }> = [
  { days: 3, label: "3 din" },
  { days: 7, label: "1 hafta" },
  { days: 14, label: "2 hafte" },
  { days: 30, label: "1 mahina" },
];

type CheckoutDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onCompleteOrder: (
    statusOverride?: string | React.MouseEvent,
  ) => Promise<boolean>;

  customerMode: "walk-in" | "existing";
  setCustomerMode: (mode: "walk-in" | "existing") => void;
  walkInName: string;
  setWalkInName: (v: string) => void;
  walkInPhone: string;
  setWalkInPhone: (v: string) => void;
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  customerResults: Customer[];
  setCustomerResults: (v: Customer[]) => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  isSearchingCustomer: boolean;
  onOpenNewCustomer: () => void;

  subtotal: number;
  grandTotal: number;
  discount: string;
  setDiscount: (v: string) => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  pendingAmount: number;
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  orderStatus: string;
  setOrderStatus: (v: string) => void;

  cartCount: number;
  isOnline: boolean;
  isSubmitting: boolean;
  disabledReason: string | null;

  dueDate?: string;
  onDueDateChange?: (d: string) => void;
  errorMessage?: string | null;
};

export default function CheckoutDrawer(props: CheckoutDrawerProps) {
  const {
    isOpen,
    onClose,
    onCompleteOrder,
    customerMode,
    setCustomerMode,
    walkInName,
    setWalkInName,
    walkInPhone,
    setWalkInPhone,
    customerSearch,
    setCustomerSearch,
    customerResults,
    setCustomerResults,
    selectedCustomer,
    setSelectedCustomer,
    isSearchingCustomer,
    onOpenNewCustomer,
    subtotal,
    grandTotal,
    discount,
    setDiscount,
    amountPaid,
    setAmountPaid,
    pendingAmount,
    paymentMethod,
    setPaymentMethod,
    orderStatus,
    setOrderStatus,
    cartCount,
    isOnline,
    isSubmitting,
    disabledReason,
    dueDate,
    onDueDateChange,
    errorMessage,
  } = props;
  const { toast } = useToast();
  const readOnly = useIsReadOnly();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleDiscountChange = (val: string) => {
    if (val === "") {
      setDiscount("");
      return;
    }
    const num = Math.max(0, Number(val));
    const capped = Math.min(subtotal, num);
    if (num > subtotal) {
      toast.warning(
        `Discount cannot exceed subtotal (Rs. ${subtotal.toLocaleString()}).`,
      );
    }
    setDiscount(String(capped));
  };

  const handleComplete = async (statusOverride?: string) => {
    const ok = await onCompleteOrder(statusOverride);
    if (ok) onClose();
  };

  const existingBalance =
    Number(
      selectedCustomer?.balance ??
        selectedCustomer?.metrics?.outstandingBalance ??
        selectedCustomer?.outstandingBalance ??
        0,
    ) || 0;
  const creditLimit = Number(selectedCustomer?.creditLimit) || 0;
  const projectedDebt = existingBalance + Math.max(0, pendingAmount);
  const exceedsCreditLimit =
    creditLimit > 0 && projectedDebt > creditLimit;
  const changeToReturn = Number(amountPaid) > grandTotal;
  const isSubmitDisabled =
    Boolean(disabledReason) || isSubmitting || cartCount === 0;

  return (
    <div
      inert={!isOpen}
      data-testid="checkout-drawer"
      className={`fixed inset-0 ${isOpen ? "" : "pointer-events-none"}`}
      style={{ zIndex: 60 }}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-gray-950/50 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sliding Panel */}
      <div
        className={`absolute inset-y-0 right-0 w-full sm:max-w-xl lg:max-w-2xl bg-card shadow-overlay flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-gray-50 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-title font-semibold text-gray-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-brand-600" />
              Order Checkout
            </h2>
            <p className="text-caption text-gray-500 mt-0.5">
              Customer, discount & payment settlement
            </p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            data-testid="checkout-close"
            aria-label="Close checkout"
            title="Close checkout (state is kept)"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* ─── CUSTOMER SEGMENT ─── */}
          <section className="space-y-2.5">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Customer Details
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-md border border-border">
              <button
                data-testid="pos-customer-mode-walkin"
                onClick={() => {
                  setCustomerMode("walk-in");
                  setSelectedCustomer(null);
                  setOrderStatus("FINAL");
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  customerMode === "walk-in"
                    ? "bg-card text-gray-900 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Walk-in Customer
              </button>
              <button
                data-testid="pos-customer-mode-existing"
                onClick={() => setCustomerMode("existing")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  customerMode === "existing"
                    ? "bg-card text-gray-900 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Existing Account
              </button>
            </div>

            {customerMode === "walk-in" && (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Customer Name (Optional)"
                    data-testid="pos-walkin-name"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Phone Number (Optional)"
                    data-testid="pos-walkin-phone"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="h-11 pl-9 font-mono"
                  />
                </div>
              </div>
            )}

            {customerMode === "existing" &&
              (selectedCustomer ? (
                <div className="flex items-center justify-between bg-brand-50 border border-brand-200 p-2.5 rounded-md">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-900 truncate flex items-center gap-1.5">
                      {selectedCustomer.shopName && (
                        <Store className="w-4 h-4 text-brand-500 shrink-0" />
                      )}
                      {selectedCustomer.name}
                    </p>
                    <p className="text-caption text-brand-700 truncate mt-0.5">
                      {selectedCustomer.phone}
                      {selectedCustomer.shopName
                        ? ` · ${selectedCustomer.shopName}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    onClick={() => setSelectedCustomer(null)}
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="Type name or phone..."
                        data-testid="pos-customer-select"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="h-11 pl-9"
                      />
                    </div>
                    <Button
                      onClick={onOpenNewCustomer}
                      disabled={readOnly}
                      variant="primary"
                      className="h-11 shrink-0 px-4"
                      title={
                        readOnly
                          ? "Subscription expired. System is in read-only mode."
                          : "Create new customer"
                      }
                    >
                      {readOnly ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Read-only
                        </span>
                      ) : (
                        `+ New`
                      )}
                    </Button>
                  </div>
                  {isSearchingCustomer && (
                    <span className="text-xs text-gray-400 mt-1.5 block">
                      Searching...
                    </span>
                  )}

                  {customerResults.length > 0 && (
                    <div className="mt-1.5 bg-card border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
                      {customerResults.map((c) => (
                        <button
                          data-testid="pos-customer-option"
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                            setCustomerSearch("");
                          }}
                          className="w-full text-left p-2 hover:bg-gray-50 border-b border-border text-sm flex justify-between cursor-pointer"
                        >
                          <span className="font-bold text-gray-800">
                            {c.name}
                          </span>
                          <span className="text-gray-400 font-mono">
                            {c.phone}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {/* Existing customer credit balance */}
            {customerMode === "existing" && selectedCustomer && (
              <div
                className={`rounded-md border p-2.5 ${
                  existingBalance > 0
                    ? "border-danger bg-danger-bg"
                    : "border-success bg-success-bg"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold uppercase tracking-wider text-gray-500">
                    Existing Credit / Udhaar
                  </span>
                  {existingBalance > 0 && (
                    <Badge variant="danger" uppercase>Outstanding</Badge>
                  )}
                </div>
                <p
                  className={`text-lg font-semibold tracking-tight mt-0.5 ${
                    existingBalance > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  Rs. {existingBalance.toLocaleString()}
                </p>
                {creditLimit > 0 && (
                  <p className="text-caption text-gray-500 mt-0.5">
                    Credit Limit: Rs. {creditLimit.toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </section>

          <hr className="border-border" />

          {/* ─── CHARGES / DISCOUNT SEGMENT ─── */}
          <section className="space-y-2.5">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" /> Charges & Discounts
            </h3>

            <div className="flex items-center justify-between gap-3 bg-gray-50 p-2.5 rounded-md border border-border">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                <span>Discount</span>
              </label>
              <div className="flex items-center rounded-md border border-gray-300 bg-card shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 overflow-hidden w-36 sm:w-40 h-11">
                <span className="flex items-center px-2.5 bg-gray-100 border-r border-border text-caption font-semibold text-gray-500 select-none h-full">
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  data-testid="pos-discount"
                  value={discount}
                  onFocus={(e) => {
                    if (discount === "0" || Number(discount) === 0)
                      setDiscount("");
                    e.target.select();
                  }}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  onBlur={() => {
                    const num = Number(discount) || 0;
                    if (num > subtotal) setDiscount(String(subtotal));
                  }}
                  className="w-full px-2.5 h-full text-right text-sm font-semibold text-gray-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                />
              </div>
            </div>

            <dl className="space-y-1.5 p-3 rounded-md bg-gray-50 border border-border">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-gray-500 text-xs font-medium">Subtotal</dt>
                <dd className="font-semibold text-gray-800 text-sm">
                  Rs. {subtotal.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-gray-500 text-xs font-medium">Discount</dt>
                <dd className="font-semibold text-danger text-sm">
                  - Rs. {(Number(discount) || 0).toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <dt className="text-gray-900 font-bold text-sm">
                  Grand Total
                </dt>
                <dd className="text-title font-semibold text-gray-900 tracking-tight">
                  Rs. {grandTotal.toLocaleString()}
                </dd>
              </div>
            </dl>

            {/* Balance Due (Udhaar) */}
            <div
              className={`rounded-md border p-3 ${
                pendingAmount > 0
                  ? "border-danger bg-danger-bg"
                  : "border-success bg-success-bg"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-caption font-semibold uppercase tracking-wider text-gray-600">
                  Balance Due (Udhar)
                </span>
                {pendingAmount > 0 ? (
                  <Badge variant="danger" uppercase>Udhar Pending</Badge>
                ) : (
                  <Badge variant="success" uppercase>Paid in Full</Badge>
                )}
              </div>
              <p
                data-testid="checkout-balance"
                className={`text-heading font-semibold tracking-tight mt-1 ${
                  pendingAmount > 0 ? "text-danger" : "text-success"
                }`}
              >
                Rs. {Math.max(0, pendingAmount).toLocaleString()}
              </p>
              {changeToReturn && (
                <p className="text-xs font-semibold text-success mt-1">
                  Change to Return: Rs.{" "}
                  {(Number(amountPaid) - grandTotal).toLocaleString()}
                </p>
              )}
              {pendingAmount > 0 &&
                orderStatus !== "ESTIMATE" &&
                onDueDateChange && (
                  <div className="mt-3 pt-3 border-t border-danger space-y-2">
                    <label
                      htmlFor="checkout-due-date"
                      className="block text-xs font-bold text-gray-700"
                    >
                      Due Date (wapsi ki tareekh)
                    </label>
                    <Input
                      id="checkout-due-date"
                      type="date"
                      value={dueDate ?? ""}
                      min={addDaysKarachi(0)}
                      onChange={(e) => onDueDateChange(e.target.value)}
                      data-testid="checkout-due-date"
                      className="h-11"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {DUE_CHIPS.map((chip) => (
                        <Button
                          key={chip.days}
                          type="button"
                          size="sm"
                          variant={
                            dueDate === addDaysKarachi(chip.days)
                              ? "primary"
                              : "secondary"
                          }
                          data-testid="checkout-due-chip"
                          data-days={chip.days}
                          onClick={() =>
                            onDueDateChange(addDaysKarachi(chip.days))
                          }
                        >
                          {chip.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </section>

          <hr className="border-border" />

          {/* ─── PAYMENT SEGMENT ─── */}
          <section className="space-y-3">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" /> Payment Settlement
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-700">
                  Amount Received
                </label>
                {pendingAmount > 0 && cartCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAmountPaid(grandTotal.toString())}
                    className="text-brand-700"
                  >
                    Pay in Full (Rs. {grandTotal.toLocaleString()})
                  </Button>
                )}
              </div>
              <div className="flex items-center rounded-md border border-gray-300 bg-card shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 overflow-hidden h-11">
                <span className="flex items-center px-3 bg-gray-100 border-r border-border text-caption font-semibold text-gray-500 select-none h-full">
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  data-testid="checkout-amount"
                  placeholder="0"
                  className="w-full px-3 h-full text-subtitle font-semibold text-gray-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Payment Method
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                data-testid="checkout-method"
                className="h-11 font-semibold"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer / Card</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Order Status
              </label>
              <Select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                data-testid="pos-status-select"
                disabled={customerMode === "walk-in"}
                className="h-11 font-semibold"
              >
                <option value="FINAL">Final (Handed to customer)</option>
                <option value="PENDING">Pending (Delivery / Pickup later)</option>
                <option value="MEMO">Memo / Amanat (On Approval)</option>
              </Select>
            </div>
          </section>
        </div>

        {/* Pinned Footer */}
        <div className="p-3 border-t border-border bg-gray-50 shrink-0 space-y-2">
          {exceedsCreditLimit && (
            <div data-testid="checkout-credit-warning" className="flex items-start gap-2 p-2.5 bg-danger-bg border border-danger rounded-md text-xs font-semibold text-danger animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger mt-0.5" />
              <span>
                Warning: Existing Debt (Rs. {existingBalance.toLocaleString()}) + New Debt (Rs. {Math.max(0, pendingAmount).toLocaleString()}) = Projected Debt (Rs. {projectedDebt.toLocaleString()}). This exceeds the limit of Rs. {creditLimit.toLocaleString()}.
              </span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              data-testid="checkout-error"
              className="flex items-start gap-2 p-2.5 bg-danger-bg border border-danger rounded-md text-xs font-semibold text-danger animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-danger mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {disabledReason && cartCount > 0 && (
            <div className="flex items-center gap-2 p-2 bg-warning-bg border border-warning rounded-md text-xs font-medium text-warning-fg animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-warning" />
              <span>{disabledReason}</span>
            </div>
          )}

          <Button
            onClick={() => handleComplete(orderStatus)}
            data-testid="checkout-submit"
            disabled={isSubmitDisabled || readOnly}
            loading={isSubmitting}
            size="lg"
            variant={readOnly ? "secondary" : "primary"}
            className="w-full text-base"
            title={
              readOnly
                ? "Subscription expired. System is in read-only mode."
                : undefined
            }
          >
            {readOnly && <Lock className="w-5 h-5" />}
            {isSubmitting
              ? "Processing..."
              : readOnly
                ? "Read-only — Subscription expired"
                : !isOnline
                  ? `Queue Order Offline`
                  : orderStatus === "FINAL"
                    ? "Complete Final Sale"
                    : orderStatus === "PENDING"
                      ? "Save Pending Order"
                      : orderStatus === "MEMO"
                        ? "Create Memo / Amanat"
                        : "Complete Final Sale"}
            {!isSubmitting && !readOnly && (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
