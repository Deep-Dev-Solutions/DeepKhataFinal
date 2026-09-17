"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Printer,
  MessageCircle,
  ArrowRight,
  Plus,
  X,
} from "lucide-react";
import { generateWhatsAppReceipt } from "@/lib/utils";
import { getAuthHeaders, API_BASE_URL } from "@/lib/auth";

export interface CompletedOrderItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  isService?: boolean;
}

export interface CompletedOrderData {
  id: string;
  orderNumber: string;
  status: string;
  customer: {
    name: string;
    phone?: string | null;
  };
  items: CompletedOrderItem[];
  financials: {
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    balance: number;
  };
  paymentMethod?: string;
  runningBalance?: number;
  isOffline?: boolean;
  createdAt?: string;
}

interface OrderSuccessModalProps {
  order: CompletedOrderData | null;
  onClose: () => void;
  onViewOrder?: (id: string) => void;
}

export default function OrderSuccessModal({
  order,
  onClose,
  onViewOrder,
}: OrderSuccessModalProps) {
  const [businessInfo, setBusinessInfo] = useState<{
    name?: string;
    phone?: string;
    address?: string;
  }>({
    name: "DeepKhata POS",
    phone: "",
    address: "",
  });

  useEffect(() => {
    if (!order) return;
    const fetchBusiness = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/businessinfo`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data?.success && data?.business) {
          setBusinessInfo({
            name: data.business.name || "DeepKhata POS",
            phone: data.business.phone || "",
            address: data.business.address || "",
          });
        }
      } catch {
        // Fallback or offline: check user/business stored in localStorage
        try {
          const storedUser = localStorage.getItem("user");
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed.business?.name) {
              setBusinessInfo({
                name: parsed.business.name,
                phone: parsed.business.phone || "",
                address: parsed.business.address || "",
              });
            }
          }
        } catch {}
      }
    };
    void fetchBusiness();
  }, [order]);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const whatsappUrl = generateWhatsAppReceipt(
    order,
    order.customer,
    order.runningBalance,
  );

  const timestamp = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  return (
    <>
      {/* ========================================================================= */}
      {/* 🟢 SCREEN UI: SUCCESS DIALOG (Hidden when printing via @media print)     */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-6 bg-gradient-to-b from-emerald-50 to-white text-center border-b border-slate-100 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {order.isOffline
                ? "Order Queued Offline!"
                : "Sale Completed Successfully!"}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="font-mono text-sm font-bold text-slate-700">
                {order.orderNumber}
              </span>
              <span
                className={`text-xs font-extrabold px-2 py-0.5 rounded-md border ${
                  order.status === "MEMO"
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                }`}
              >
                {order.status === "MEMO" ? "MEMO (Amanat)" : "FINAL SALE"}
              </span>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="p-6 space-y-4 text-sm">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-bold text-slate-900">
                  {order.customer.name}{" "}
                  {order.customer.phone ? `(${order.customer.phone})` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Items Purchased</span>
                <span className="font-semibold text-slate-800">
                  {order.items.reduce((s, i) => s + i.qty, 0)} item(s)
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">Net Total</span>
                <span className="font-black text-slate-900 text-base">
                  Rs. {order.financials.total.toLocaleString()}
                </span>
              </div>
              {order.financials.discount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Discount Given</span>
                  <span className="font-bold text-slate-700">
                    -Rs. {order.financials.discount.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid</span>
                <span className="font-bold text-emerald-600">
                  Rs. {order.financials.paid.toLocaleString()}
                </span>
              </div>
              {order.financials.balance > 0 && (
                <div className="flex justify-between">
                  <span className="text-rose-600 font-semibold">
                    Remaining Udhar
                  </span>
                  <span className="font-black text-rose-600">
                    Rs. {order.financials.balance.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {order.isOffline && (
              <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center font-medium">
                Saved securely in IndexedDB. Stock is reserved locally and will
                automatically synchronize when network is restored.
              </p>
            )}

            {/* Primary Action Buttons Row: Print Slip + Share via WhatsApp */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md shadow-slate-900/10 cursor-pointer active:scale-[0.98]"
              >
                <Printer className="w-4 h-4 text-slate-200" />
                <span>Print Slip</span>
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-[0.98]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            </div>

            {/* Secondary Navigation Row: View Order & Next Sale */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {!order.isOffline && onViewOrder && (
                <button
                  type="button"
                  onClick={() => onViewOrder(order.id)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                >
                  <span>View Order</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                  order.isOffline || !onViewOrder ? "col-span-2" : ""
                }`}
              >
                <Plus className="w-4 h-4" /> Next Sale
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🟢 PRINT-ONLY 80MM / 58MM THERMAL RECEIPT SLIP                           */}
      {/* ========================================================================= */}
      <div
        id="thermal-print-slip"
        className="hidden print:block thermal-slip font-mono text-[12px] text-black bg-white"
        style={{
          maxWidth: "80mm",
          width: "100%",
          margin: "0 auto",
          padding: "4px",
        }}
      >
        {/* Slip Header */}
        <div className="text-center pb-2 mb-2 border-b border-dashed border-black">
          <div className="font-extrabold text-[15px] tracking-wider uppercase">
            DeepKhata
          </div>
          <div className="font-bold text-[13px]">
            {businessInfo.name || "Main Counter"}
          </div>
          {businessInfo.phone && (
            <div className="text-[11px]">Tel: {businessInfo.phone}</div>
          )}
          {businessInfo.address && (
            <div className="text-[10px] text-slate-700 leading-tight">
              {businessInfo.address}
            </div>
          )}
          <div className="mt-1.5 pt-1.5 border-t border-dashed border-black flex justify-between text-[11px]">
            <span>
              Order: <strong>{order.orderNumber}</strong>
            </span>
            <span className="font-bold">
              {order.status === "MEMO" ? "MEMO / AMANAT" : "SALE SLIP"}
            </span>
          </div>
          <div className="flex justify-between text-[11px] mt-0.5">
            <span>Customer: {order.customer.name}</span>
            {order.customer.phone && <span>{order.customer.phone}</span>}
          </div>
        </div>

        {/* Line Items Table Header */}
        <div className="flex justify-between font-bold border-b border-black pb-1 mb-1 text-[11px]">
          <span className="flex-1 text-left">ITEM</span>
          <span className="w-10 text-center">QTY</span>
          <span className="w-16 text-right">PRICE</span>
          <span className="w-16 text-right">TOTAL</span>
        </div>

        {/* Line Items Body (Parts + Services) */}
        <div className="space-y-1.5 pb-2 mb-2 border-b border-dashed border-black">
          {order.items.map((item, index) => (
            <div key={index} className="text-[11px] leading-snug">
              <div className="font-bold">
                {item.name} {item.isService ? "(Service)" : ""}
              </div>
              <div className="flex justify-between">
                <span className="flex-1 text-slate-600 text-[10px]">
                  {item.isService ? "Labor" : "Spare Part"}
                </span>
                <span className="w-10 text-center">{item.qty}</span>
                <span className="w-16 text-right">
                  {item.price.toLocaleString()}
                </span>
                <span className="w-16 text-right font-medium">
                  {(item.price * item.qty).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Financials & Payment Breakdown */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>Rs. {order.financials.subtotal.toLocaleString()}</span>
          </div>

          {order.financials.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-Rs. {order.financials.discount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between font-extrabold text-[13px] border-t border-black pt-1 mt-1">
            <span>Grand Total:</span>
            <span>Rs. {order.financials.total.toLocaleString()}</span>
          </div>

          <div className="flex justify-between pt-1">
            <span>Payment Method:</span>
            <span className="font-bold uppercase">
              {order.paymentMethod || "CASH"}
            </span>
          </div>

          <div className="flex justify-between">
            <span>Amount Paid:</span>
            <span className="font-bold">
              Rs. {order.financials.paid.toLocaleString()}
            </span>
          </div>

          {order.financials.balance > 0 && (
            <div className="flex justify-between font-bold text-black border-t border-dotted border-black pt-0.5">
              <span>Remaining Udhar (Baqaya):</span>
              <span>Rs. {order.financials.balance.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Slip Footer */}
        <div className="text-center pt-3 mt-3 border-t border-dashed border-black text-[11px]">
          <div className="font-bold">Thank you for your business!</div>
          <div className="text-[10px] mt-0.5">{timestamp}</div>
          <div className="text-[9px] mt-1 text-slate-600 tracking-wider">
            DeepKhata POS System
          </div>
        </div>
      </div>
    </>
  );
}
