"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, MessageCircle, Send, Wallet, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/auth";
import {
  Invoice,
  MONEY_RE,
  PAYMENT_METHODS,
  PaymentMethod,
  STATUS_BADGES,
  formatDate,
  formatMoney,
} from "./types";

interface SendResponse {
  invoice: Invoice;
  whatsappUrl: string | null;
}

interface PaymentResponse {
  invoiceStatus: string;
  totalPaid: string;
}

const input =
  "w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const actionBtn =
  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50";

export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "pdf" | "send" | "void" | "pay">("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [payError, setPayError] = useState("");

  const load = useCallback(async () => {
    try {
      setInvoice(await api.get<Invoice>(`/agency/billing/invoices/${invoiceId}`));
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run().catch(console.error);
  }, [load]);

  const downloadPdf = async () => {
    if (!invoice) return;
    setBusy("pdf");
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/agency/billing/invoices/${invoice.id}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Could not download PDF (status ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    if (!invoice) return;
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const res = await api.post<SendResponse>(`/agency/billing/invoices/${invoice.id}/send`);
      setInvoice((prev) => (prev ? { ...prev, ...res.invoice, payments: prev.payments } : prev));
      setWhatsappUrl(res.whatsappUrl);
      setNotice("Invoice emailed to the owner.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setBusy("");
    }
  };

  const voidInvoice = async () => {
    if (!invoice) return;
    if (!window.confirm(`Void invoice ${invoice.number}? This cannot be undone.`)) return;
    setBusy("void");
    setError("");
    setNotice("");
    try {
      await api.post(`/agency/billing/invoices/${invoice.id}/void`);
      await load();
      setNotice("Invoice voided.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to void invoice");
    } finally {
      setBusy("");
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    setPayError("");
    if (!MONEY_RE.test(amount) || Number(amount) <= 0) {
      return setPayError("Amount must be a positive number with up to 2 decimals");
    }
    setBusy("pay");
    try {
      const body: Record<string, unknown> = { amount, method };
      if (reference.trim()) body.reference = reference.trim();
      if (receivedAt) body.receivedAt = receivedAt;
      const res = await api.post<PaymentResponse>(`/agency/billing/invoices/${invoice.id}/payments`, body);
      setAmount("");
      setReference("");
      setReceivedAt("");
      setNotice(`Payment recorded. Total paid ${formatMoney(res.totalPaid)}, invoice is ${res.invoiceStatus}.`);
      await load();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading invoice...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 space-y-4">
        <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600">
          <ArrowLeft size={16} />
          Back to Billing
        </Link>
        <div role="alert" className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl p-4 text-sm font-medium">
          {error || "Invoice not found"}
        </div>
      </div>
    );
  }

  const isVoid = invoice.status === "VOID";
  const isPaid = invoice.status === "PAID";
  const payments = invoice.payments ?? [];

  return (
    <div data-testid="invoice-detail" data-invoice-id={invoice.id} className="space-y-6 animate-in fade-in duration-500">
      <div>
        <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 mb-2">
          <ArrowLeft size={16} />
          Back to Billing
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-mono">{invoice.number}</h2>
              <span
                data-testid="invoice-status"
                className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  STATUS_BADGES[invoice.status] ?? STATUS_BADGES.DRAFT
                }`}
              >
                {invoice.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {invoice.businessName} - {invoice.billingCycle === "YEARLY" ? "Yearly" : "Monthly"} x {invoice.periods}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={busy !== ""}
              data-testid="invoice-pdf"
              className={`${actionBtn} text-slate-700 bg-white border-slate-200 hover:bg-slate-50`}
            >
              {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download PDF
            </button>
            {!isVoid && (
              <button
                type="button"
                onClick={send}
                disabled={busy !== ""}
                data-testid="invoice-send"
                className={`${actionBtn} text-white bg-indigo-600 border-indigo-600 hover:bg-indigo-700`}
              >
                {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {invoice.sentAt ? "Resend" : "Send"}
              </button>
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="invoice-whatsapp"
                className={`${actionBtn} text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}
              >
                <MessageCircle size={14} />
                WhatsApp
              </a>
            )}
            {!isVoid && !isPaid && (
              <button
                type="button"
                onClick={voidInvoice}
                disabled={busy !== ""}
                data-testid="invoice-void"
                className={`${actionBtn} text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100`}
              >
                {busy === "void" ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                Void
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" data-testid="invoice-error" className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl p-3 text-sm font-medium">
          {error}
        </div>
      )}
      {notice && (
        <div data-testid="invoice-notice" className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl p-3 text-sm font-medium">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total", value: formatMoney(invoice.total) },
          { label: "Due date", value: formatDate(invoice.dueDate) },
          { label: "Period", value: `${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}` },
          { label: "Sent / Paid", value: `${formatDate(invoice.sentAt)} / ${formatDate(invoice.paidAt)}` },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">{k.label}</div>
            <div className="text-base font-bold text-slate-900 mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 font-bold text-slate-900">Line items</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Unit price</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.lines.map((l, i) => (
                <tr key={i} data-testid="invoice-line">
                  <td className="px-6 py-3 text-slate-800">{l.description}</td>
                  <td className="px-6 py-3 text-right">{l.quantity}</td>
                  <td className="px-6 py-3 text-right">{formatMoney(l.unitPrice)}</td>
                  <td className="px-6 py-3 text-right font-medium">{formatMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-slate-500">Subtotal</td>
                <td className="px-6 py-2 text-right">{formatMoney(invoice.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-slate-500">Discount</td>
                <td className="px-6 py-2 text-right">- {formatMoney(invoice.discount)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right font-bold text-slate-900">Total</td>
                <td className="px-6 py-2 text-right font-bold text-slate-900">{formatMoney(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 font-bold text-slate-900 flex items-center gap-2">
            <Wallet size={16} className="text-indigo-600" />
            Payments
          </div>
          {payments.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No payments recorded yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p.id} data-testid="payment-row" className="px-6 py-3 flex justify-between gap-4 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-slate-500">
                      {PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                      {p.reference ? ` - ${p.reference}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{formatDate(p.receivedAt ?? p.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isVoid && !isPaid && (
          <form
            data-testid="payment-form"
            onSubmit={recordPayment}
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 font-bold text-slate-900">Record payment</div>
            <div className="p-6 space-y-4">
              {payError && (
                <div role="alert" data-testid="payment-error" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-100">
                  {payError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (PKR)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    data-testid="payment-amount"
                    onChange={(e) => setAmount(e.target.value)}
                    className={input}
                    placeholder="e.g. 3000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                  <select
                    value={method}
                    data-testid="payment-method"
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className={input}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={reference}
                    data-testid="payment-reference"
                    onChange={(e) => setReference(e.target.value)}
                    className={input}
                    placeholder="Txn / receipt no."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Received on</label>
                  <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={input} />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy !== ""}
                data-testid="payment-submit"
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "pay" ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                {busy === "pay" ? "Recording..." : "Record payment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
