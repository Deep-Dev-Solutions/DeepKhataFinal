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
import { useToast } from "@/context/ToastContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

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
  customerResults: any[];
  setCustomerResults: (v: any[]) => void;
  selectedCustomer: any | null;
  setSelectedCustomer: (c: any | null) => void;
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
    Number(selectedCustomer?.metrics?.outstandingBalance) || 0;
  const creditLimit = Number(selectedCustomer?.creditLimit) || 0;
  const changeToReturn = Number(amountPaid) > grandTotal;
  const isSubmitDisabled =
    Boolean(disabledReason) || isSubmitting || cartCount === 0;

  return (
    <div
      inert={!isOpen}
      className={`fixed inset-0 ${isOpen ? "" : "pointer-events-none"}`}
      style={{ zIndex: 60 }}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sliding Panel */}
      <div
        className={`absolute inset-y-0 right-0 w-full sm:max-w-xl lg:max-w-2xl bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              Order Checkout
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer, discount & payment settlement
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            title="Close checkout (state is kept)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* ─── CUSTOMER SEGMENT ─── */}
          <section className="space-y-2.5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <User className="w-3.5 h-3.5" /> Customer Details
            </h3>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                onClick={() => {
                  setCustomerMode("walk-in");
                  setSelectedCustomer(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  customerMode === "walk-in"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Walk-in Customer
              </button>
              <button
                onClick={() => setCustomerMode("existing")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  customerMode === "existing"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Existing Account
              </button>
            </div>

            {customerMode === "walk-in" && (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Customer Name (Optional)"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    className="w-full pl-9 pr-3 h-10 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none text-slate-800 font-medium placeholder-slate-400 shadow-xs transition-all"
                  />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Phone Number (Optional)"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="w-full pl-9 pr-3 h-10 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none text-slate-800 font-medium placeholder-slate-400 font-mono shadow-xs transition-all"
                  />
                </div>
              </div>
            )}

            {customerMode === "existing" &&
              (selectedCustomer ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-blue-900 truncate flex items-center gap-1.5">
                      {selectedCustomer.shopName && (
                        <Store className="w-4 h-4 text-blue-500 shrink-0" />
                      )}
                      {selectedCustomer.name}
                    </p>
                    <p className="text-xs text-blue-600 truncate mt-0.5">
                      {selectedCustomer.phone}
                      {selectedCustomer.shopName
                        ? ` · ${selectedCustomer.shopName}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-blue-600 hover:text-rose-600 font-bold shrink-0 cursor-pointer px-2 py-1 bg-white rounded-lg border border-blue-200 hover:border-rose-200"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Type name or phone..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-9 pr-3 h-10 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-xs"
                      />
                    </div>
                    <button
                      onClick={onOpenNewCustomer}
                      disabled={readOnly}
                      title={
                        readOnly
                          ? "Subscription expired. System is in read-only mode."
                          : "Create new customer"
                      }
                      className={`px-4 h-10 rounded-xl text-white text-xs font-bold transition-colors shrink-0 shadow-xs ${
                        readOnly
                          ? "bg-slate-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                      }`}
                    >
                      {readOnly ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Read-only
                        </span>
                      ) : (
                        `+ New`
                      )}
                    </button>
                  </div>
                  {isSearchingCustomer && (
                    <span className="text-xs text-slate-400 mt-1.5 block">
                      Searching...
                    </span>
                  )}

                  {customerResults.length > 0 && (
                    <div className="mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                            setCustomerSearch("");
                          }}
                          className="w-full text-left p-2 hover:bg-slate-50 border-b border-slate-50 text-sm flex justify-between cursor-pointer"
                        >
                          <span className="font-bold text-slate-800">
                            {c.name}
                          </span>
                          <span className="text-slate-400 font-mono">
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
                className={`rounded-xl border p-2.5 ${
                  existingBalance > 0
                    ? "border-rose-200 bg-rose-50/50"
                    : "border-emerald-200 bg-emerald-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Existing Credit / Udhaar
                  </span>
                  {existingBalance > 0 && (
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                      Outstanding
                    </span>
                  )}
                </div>
                <p
                  className={`text-lg font-black tracking-tight mt-0.5 ${
                    existingBalance > 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  Rs. {existingBalance.toLocaleString()}
                </p>
                {creditLimit > 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Credit Limit: Rs. {creditLimit.toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </section>

          <hr className="border-slate-200" />

          {/* ─── CHARGES / DISCOUNT SEGMENT ─── */}
          <section className="space-y-2.5">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" /> Charges & Discounts
            </h3>

            <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Discount</span>
              </label>
              <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 overflow-hidden w-36 sm:w-40">
                <span className="flex items-center px-2.5 bg-slate-100 border-r border-slate-200 text-xs font-bold text-slate-500 select-none h-10">
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
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
                  className="w-full px-2.5 h-10 text-right text-sm font-bold text-slate-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                />
              </div>
            </div>

            <dl className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-slate-500 text-xs font-medium">Subtotal</dt>
                <dd className="font-semibold text-slate-800 text-sm">
                  Rs. {subtotal.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-slate-500 text-xs font-medium">Discount</dt>
                <dd className="font-semibold text-rose-600 text-sm">
                  - Rs. {(Number(discount) || 0).toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <dt className="text-slate-900 font-bold text-sm">
                  Grand Total
                </dt>
                <dd className="text-lg font-black text-slate-900 tracking-tight">
                  Rs. {grandTotal.toLocaleString()}
                </dd>
              </div>
            </dl>

            {/* Balance Due (Udhaar) */}
            <div
              className={`rounded-xl border p-3 ${
                pendingAmount > 0
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Balance Due (Udhar)
                </span>
                {pendingAmount > 0 ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                    Udhar Pending
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Paid in Full
                  </span>
                )}
              </div>
              <p
                className={`text-xl font-black tracking-tight mt-1 ${
                  pendingAmount > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                Rs. {Math.max(0, pendingAmount).toLocaleString()}
              </p>
              {changeToReturn && (
                <p className="text-xs font-semibold text-emerald-700 mt-1">
                  Change to Return: Rs.{" "}
                  {(Number(amountPaid) - grandTotal).toLocaleString()}
                </p>
              )}
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* ─── PAYMENT SEGMENT ─── */}
          <section className="space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" /> Payment Settlement
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Amount Received
                </label>
                {pendingAmount > 0 && cartCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountPaid(grandTotal.toString())}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200/60 transition-colors cursor-pointer"
                  >
                    Pay in Full (Rs. {grandTotal.toLocaleString()})
                  </button>
                )}
              </div>
              <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 overflow-hidden h-10">
                <span className="flex items-center px-3 bg-slate-100 border-r border-slate-200 text-xs font-bold text-slate-500 select-none h-full">
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 h-full text-base font-bold text-slate-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 h-10 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-xs cursor-pointer"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer / Card</option>
              </select>
            </div>
          </section>
        </div>

        {/* Pinned Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0 space-y-2">
          {disabledReason && cartCount > 0 && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{disabledReason}</span>
            </div>
          )}

          <button
            onClick={() => handleComplete("FINAL")}
            disabled={isSubmitDisabled || readOnly}
            title={
              readOnly
                ? "Subscription expired. System is in read-only mode."
                : undefined
            }
            className={`w-full py-3 text-white rounded-xl font-bold text-base transition-all shadow-md shadow-slate-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 ${
              readOnly
                ? "cursor-not-allowed bg-slate-400"
                : "bg-slate-900 hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            }`}
          >
            {readOnly && <Lock className="w-5 h-5" />}
            {isSubmitting
              ? "Processing..."
              : readOnly
                ? "Read-only — Subscription expired"
                : !isOnline
                  ? `Queue Order Offline`
                  : "Complete Order"}
            {!isSubmitting && !readOnly && (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
