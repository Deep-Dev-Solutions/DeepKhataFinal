"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Download, Printer } from "lucide-react";
import {
  fetchPublicInvoice,
  publicInvoicePdfUrl,
  type PublicInvoice,
} from "@/lib/billing";
import { formatShortDate } from "@/lib/dues";

const rs = (v: number | string | null | undefined) =>
  `Rs ${(Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERDUE: "bg-rose-50 text-rose-700 border-rose-200",
  VOID: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchPublicInvoice(token)
      .then((data) => !cancelled && setInvoice(data))
      .catch(() => !cancelled && setInvoice(null))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div
        data-testid="invoice-public-missing"
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <p className="text-slate-900 font-bold text-lg">Invoice not found</p>
        <p className="text-slate-500 text-sm">
          This link may be invalid or expired.
        </p>
      </div>
    );
  }

  const { agency } = invoice;
  const unpaid = invoice.status !== "PAID" && invoice.status !== "VOID";
  const hasPayDetails = Boolean(agency.bank || agency.jazzcash || agency.easypaisa);
  const hasDiscount = Number(invoice.discount) > 0;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 font-sans text-slate-900 print:bg-white print:py-0 print:px-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { @page { size: A4 portrait; margin: 10mm; } html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-break { break-inside: avoid; } }`,
        }}
      />

      <div className="max-w-3xl mx-auto mb-4 flex flex-wrap justify-end gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
        <a
          data-testid="invoice-public-pdf"
          href={publicInvoicePdfUrl(token)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Download className="w-4 h-4" /> Download PDF
        </a>
      </div>

      <div
        data-testid="invoice-public"
        className="max-w-3xl mx-auto overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm print:border-none print:shadow-none"
      >
        <div className="h-2 bg-blue-600" />
        <div className="p-6 sm:p-10 print:p-4">
          <div className="no-break flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                From
              </p>
              <h1 className="text-xl font-black">{agency.name}</h1>
              {agency.address && (
                <p className="text-sm text-slate-500">{agency.address}</p>
              )}
              {agency.ntn && (
                <p className="text-sm text-slate-500">NTN: {agency.ntn}</p>
              )}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Invoice
              </p>
              <p
                data-testid="invoice-public-number"
                className="text-xl font-black"
              >
                {invoice.number}
              </p>
              <span
                data-testid="invoice-public-status"
                className={`mt-2 inline-block rounded-lg border px-3 py-1 text-xs font-bold uppercase tracking-wider ${STATUS_STYLE[invoice.status] ?? "bg-amber-50 text-amber-700 border-amber-200"}`}
              >
                {invoice.status}
              </span>
              {invoice.dueDate && (
                <p className="mt-2 text-sm text-slate-500">
                  Due {formatShortDate(invoice.dueDate)}
                </p>
              )}
            </div>
          </div>

          <div className="no-break mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Billed to
            </p>
            <p className="text-lg font-bold">{invoice.businessName}</p>
            {invoice.periodStart && invoice.periodEnd && (
              <p className="text-sm text-slate-500">
                Period {formatShortDate(invoice.periodStart)} to{" "}
                {formatShortDate(invoice.periodEnd)}
              </p>
            )}
          </div>

          <div className="no-break mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-3 font-medium">{line.description}</td>
                    <td className="py-3 text-center text-slate-600">
                      {Number(line.quantity)}
                    </td>
                    <td className="py-3 text-right text-slate-600">
                      {rs(line.unitPrice)}
                    </td>
                    <td className="py-3 text-right font-semibold">
                      {rs(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="no-break mt-6 ml-auto w-full space-y-2 border-t border-slate-200 pt-4 sm:w-1/2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{rs(invoice.subtotal)}</span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between text-sm font-semibold text-emerald-600">
                <span>Discount</span>
                <span>- {rs(invoice.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 font-black">
              <span>Total</span>
              <span data-testid="invoice-public-total" className="text-2xl">
                {rs(invoice.total)}
              </span>
            </div>
          </div>

          {unpaid && (
            <div
              data-testid="invoice-public-pay"
              className="no-break mt-8 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm"
            >
              <p className="mb-2 font-bold text-slate-900">How to pay</p>
              {hasPayDetails ? (
                <ul className="space-y-1 text-slate-700">
                  {agency.bank && (
                    <li>
                      <span className="font-semibold">Bank:</span> {agency.bank}
                    </li>
                  )}
                  {agency.jazzcash && (
                    <li>
                      <span className="font-semibold">JazzCash:</span>{" "}
                      {agency.jazzcash}
                    </li>
                  )}
                  {agency.easypaisa && (
                    <li>
                      <span className="font-semibold">Easypaisa:</span>{" "}
                      {agency.easypaisa}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-slate-600">
                  Please contact {agency.name} for payment details.
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                After paying, send the receipt to {agency.name} on WhatsApp with
                invoice {invoice.number}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
