"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Printer,
  Store,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

export default function InvoicePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/order/public/invoice/${id}`);
        const data = await res.json();
        if (data.success) setInvoice(data.invoice);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchInvoice();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">
          Generating digital receipt...
        </p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-2">
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <p className="text-slate-900 font-bold text-lg">Invoice not found</p>
        <p className="text-slate-500 text-sm">
          This link may be invalid or expired.
        </p>
      </div>
    );
  }

  const { business, customer, items, payments } = invoice;

  return (
    // 🟢 PREMIUM BACKGROUND (Dot Grid)
    <div className="min-h-screen bg-slate-50/80 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] py-10 px-4 font-sans text-slate-900 print:bg-white print:bg-none print:py-0 print:px-0">
      {/* 🟢 ACTION BAR (Hidden when printing) */}
      <div className="max-w-3xl mx-auto mb-6 flex justify-end gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* 🟢 THE INVOICE PAPER */}
      <div className="max-w-3xl mx-auto bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-3xl print:shadow-none print:rounded-none overflow-hidden border border-slate-100 print:border-none">
        {/* Top Accent Line */}
        <div
          className="h-3 w-full bg-blue-600 print:bg-blue-600"
          style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
        />

        <div className="p-8 sm:p-12">
          {/* ================= HEADER ================= */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 mb-10">
            {/* Left: Shop Info */}
            <div className="flex items-start gap-4">
              {business.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt="Logo"
                  className="w-16 h-16 object-cover rounded-2xl shadow-sm border border-slate-100"
                />
              ) : (
                <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                  <Store className="w-8 h-8" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  {business.name}
                </h1>
                <div className="mt-2 space-y-1 text-sm text-slate-500">
                  {business.address && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> {business.address}
                    </p>
                  )}
                  {business.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> {business.phone}
                    </p>
                  )}
                  {business.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> {business.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Invoice Details */}
            <div className="text-left sm:text-right w-full sm:w-auto bg-slate-50 sm:bg-transparent p-4 sm:p-0 rounded-2xl sm:rounded-none">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">
                Invoice
              </h2>
              <p className="text-xl font-black text-slate-900 mb-1">
                {invoice.orderNumber}
              </p>
              <p className="text-sm font-medium text-slate-500 mb-3">
                {new Date(invoice.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>

              {/* Dynamic Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                  invoice.paymentStatus === "PAID"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : invoice.paymentStatus === "PARTIAL"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
                style={{
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                {invoice.paymentStatus === "PAID" && (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {invoice.paymentStatus === "PARTIAL" && (
                  <Clock className="w-3.5 h-3.5" />
                )}
                {invoice.paymentStatus === "UNPAID" && (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {invoice.paymentStatus}
              </div>
            </div>
          </div>

          {/* ================= BILL TO (CUSTOMER CARD) ================= */}
          <div
            className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-10"
            style={{
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}
          >
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Billed To
            </p>
            <p className="text-lg font-bold text-slate-900">
              {customer?.name || "Walk-in Customer"}
            </p>
            {customer && (
              <div className="mt-1 flex flex-col gap-0.5 text-sm font-medium text-slate-600">
                <p>{customer.phone}</p>
                {customer.address && (
                  <p className="text-slate-500 font-normal">
                    {customer.address}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ================= ITEMS TABLE ================= */}
          <div className="mb-10 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
                    Qty
                  </th>
                  <th className="py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                    Price
                  </th>
                  <th className="py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item: any, idx: number) => (
                  <tr key={idx} className="group">
                    <td className="py-4">
                      <p className="font-bold text-slate-900">
                        {item.product?.name || "Item"}
                      </p>
                    </td>
                    <td className="py-4 text-center font-medium text-slate-600">
                      {item.quantity}
                    </td>
                    <td className="py-4 text-right font-medium text-slate-600">
                      {business.currency} {item.price.toLocaleString()}
                    </td>
                    <td className="py-4 text-right font-bold text-slate-900">
                      {business.currency}{" "}
                      {(item.price * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ================= FINANCIAL TOTALS ================= */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8 border-t border-slate-200 pt-8">
            {/* Notes Section */}
            <div className="w-full sm:w-1/2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Terms & Notes
              </p>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Thank you for your business. Please retain this digital receipt
                for your records. Returns are accepted within 7 days with
                original packaging.
              </p>
            </div>

            {/* Math Section */}
            <div className="w-full sm:w-1/2 space-y-3">
              <div className="flex justify-between text-sm font-medium text-slate-600">
                <span>Subtotal</span>
                <span>
                  {business.currency}{" "}
                  {(invoice.totalAmount + invoice.discount).toLocaleString()}
                </span>
              </div>

              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm font-bold text-emerald-600">
                  <span>Discount Applied</span>
                  <span>
                    - {business.currency} {invoice.discount.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between items-center text-lg font-black text-slate-900 pt-4 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-2xl">
                  {business.currency} {invoice.totalAmount.toLocaleString()}
                </span>
              </div>

              {/* Payments Ledger */}
              {payments.length > 0 && (
                <div className="pt-4 pb-2 space-y-2">
                  {payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex justify-between text-xs font-medium text-slate-500"
                    >
                      <span>
                        Paid ({p.method}) on{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                      <span>
                        - {business.currency} {p.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Amount Due (Highlighted if they owe money) */}
              <div
                className={`flex justify-between items-center pt-4 border-t border-slate-200 ${invoice.pendingBalance > 0 ? "text-rose-600" : "text-slate-400"}`}
              >
                <span className="text-sm font-bold uppercase tracking-wider">
                  Amount Due
                </span>
                <span className="text-xl font-black">
                  {business.currency} {invoice.pendingBalance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ================= WATERMARK ================= */}
          <div className="mt-16 text-center print:mt-24">
            <p className="text-xs font-bold text-slate-300 tracking-widest uppercase">
              Powered by BizFlow
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
