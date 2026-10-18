"use client";

import Link from "next/link";
import { Invoice, STATUS_BADGES, formatDate, formatMoney } from "./types";

export default function InvoicesTable({ invoices, showBusiness = true }: { invoices: Invoice[]; showBusiness?: boolean }) {
  const cols = showBusiness ? 7 : 6;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table data-testid="invoices-table" className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
            <tr>
              <th className="px-6 py-4">Invoice</th>
              {showBusiness && <th className="px-6 py-4">Business</th>}
              <th className="px-6 py-4">Period</th>
              <th className="px-6 py-4">Total</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Due</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-6 py-8 text-center text-slate-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  data-testid="invoice-row"
                  data-status={inv.status}
                  data-invoice-id={inv.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4 font-mono font-medium text-slate-900">{inv.number}</td>
                  {showBusiness && <td className="px-6 py-4 text-slate-700">{inv.businessName}</td>}
                  <td className="px-6 py-4 text-slate-500">
                    {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMoney(inv.total)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        STATUS_BADGES[inv.status] ?? STATUS_BADGES.DRAFT
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(inv.dueDate)}</td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/billing/${inv.id}`}
                      data-testid="invoice-open"
                      className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
