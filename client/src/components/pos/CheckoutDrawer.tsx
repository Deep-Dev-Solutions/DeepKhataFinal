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
} from "lucide-react";
import { useToast } from "@/context/ToastContext";

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

  const existingBalance = Number(
    selectedCustomer?.metrics?.outstandingBalance,
  ) || 0;
  const creditLimit = Number(selectedCustomer?.creditLimit) || 0;
  const changeToReturn = Number(amountPaid) > grandTotal;
  const isSubmitDisabled =
    Boolean(disabledReason) || isSubmitting || cartCount === 0;

  return (
    <div
      inert={!isOpen}
      className={`fixed inset-0 z-40 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ${
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
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              Checkout
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Customer, discount & payment summary
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Close checkout (state is kept)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* ─── CUSTOMER SEGMENT ─── */}
          <section className="space-y-2.5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-500" /> Customer
            </h3>
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
              <button
                onClick={() => {
                  setCustomerMode("walk-in");
                  setSelectedCustomer(null);
                }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                  customerMode === "walk-in"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Walk-in
              </button>
              <button
                onClick={() => setCustomerMode("existing")}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                  customerMode === "existing"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Existing / Search
              </button>
            </div>

            {customerMode === "walk-in" && (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Customer Name (Optional)"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    className="w-full pl-10 pr-3 h-10 border border-slate-300 rounded-xl text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 font-medium placeholder-slate-400 shadow-sm"
                  />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Phone Number (Optional)"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="w-full pl-10 pr-3 h-10 border border-slate-300 rounded-xl text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 font-medium placeholder-slate-400 font-mono shadow-sm"
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
                    className="text-sm text-blue-600 hover:text-rose-600 font-bold shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Type name or phone..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-10 pr-3 h-10 border border-slate-300 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                      />
                    </div>
                    <button
                      onClick={onOpenNewCustomer}
                      className="px-4 h-10 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shrink-0 shadow-sm cursor-pointer"
                      title="Create new customer"
                    >
                      + New
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

            {/* Existing customer credit balance — compact typography */}
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
                  className={`text-xl font-black tracking-tight mt-0.5 ${
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
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4 text-slate-500" /> Charges
            </h3>

            <div className="flex items-center justify-between gap-3 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Tag className="w-4 h-4 text-slate-500" />
                <span>Discount</span>
              </label>
              <div className="relative w-40">
                <span className="text-xs font-bold text-slate-400 absolute left-3 top-2.5 pointer-events-none">
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
                  className="w-full pl-11 pr-3 h-10 text-right text-base font-black text-slate-900 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  placeholder="0"
                />
              </div>
            </div>

            <dl className="space-y-1 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-slate-500 font-medium">Subtotal</dt>
                <dd className="font-bold text-slate-800">
                  Rs. {subtotal.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <dt className="text-slate-500 font-medium">Discount</dt>
                <dd className="font-bold text-rose-600">
                  - Rs. {(Number(discount) || 0).toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                <dt className="text-slate-900 font-black uppercase tracking-wider text-sm">
                  Grand Total
                </dt>
                <dd className="text-xl font-black text-slate-900 tracking-tight">
                  Rs. {grandTotal.toLocaleString()}
                </dd>
              </div>
            </dl>

            {/* Balance Due (Udhaar) — compact typography */}
            <div
              className={`rounded-xl border p-2.5 ${
                pendingAmount > 0
                  ? "border-rose-200 bg-rose-50/50"
                  : "border-emerald-200 bg-emerald-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Balance Due (Udhaar)
                </span>
                {pendingAmount > 0 && (
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">
                    Due
                  </span>
                )}
              </div>
              <p
                className={`text-2xl font-black tracking-tight mt-0.5 ${
                  pendingAmount > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                Rs. {Math.max(0, pendingAmount).toLocaleString()}
              </p>
              {changeToReturn && (
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  Change to Return: Rs.{" "}
                  {(Number(amountPaid) - grandTotal).toLocaleString()}
                </p>
              )}
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* ─── PAYMENT SEGMENT ─── */}
          <section className="space-y-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Wallet className="w-4 h-4 text-slate-500" /> Payment
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-bold text-slate-700">
                  Amount Received
                </label>
                {pendingAmount > 0 && cartCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountPaid(grandTotal.toString())}
                    className="text-blue-600 hover:text-blue-800 font-bold text-sm hover:underline cursor-pointer"
                  >
                    Pay in Full
                  </button>
                )}
              </div>
              <div className="relative">
                <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="w-full pl-10 pr-3 h-10 border border-slate-300 rounded-xl text-base font-black text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 h-10 border border-slate-300 rounded-xl text-base font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm cursor-pointer"
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </select>
            </div>

            {customerMode === "existing" && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Order Type / Settlement
                </label>
                <div className="flex relative">
                  <button
                    onClick={() => setOrderStatus("FINAL")}
                    className={`flex-1 py-2 rounded-l-xl text-sm font-bold transition-colors cursor-pointer ${
                      orderStatus === "FINAL"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    FINAL Sale
                  </button>
                  <button
                    onClick={() => setOrderStatus("MEMO")}
                    className={`flex-1 py-2 rounded-r-xl text-sm font-bold transition-colors cursor-pointer ${
                      orderStatus === "MEMO"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    MEMO / Amanat
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Pinned Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0 space-y-2">
          {disabledReason && cartCount > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{disabledReason}</span>
            </div>
          )}

          <button
            onClick={() => handleComplete()}
            disabled={isSubmitDisabled}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting
              ? "Processing..."
              : !isOnline
                ? `Queue ${orderStatus} Order Offline`
                : orderStatus === "FINAL"
                  ? "Complete Order"
                  : "Save Pending Order (MEMO)"}
            {!isSubmitting && <CheckCircle2 className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}