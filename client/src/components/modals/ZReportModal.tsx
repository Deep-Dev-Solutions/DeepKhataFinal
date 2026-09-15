"use client";

import { useState } from "react";
import { X, Printer, Copy, Check, FileText, CheckCircle2, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  reportData: any;
};

export default function ZReportModal({ isOpen, onClose, reportData }: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !reportData) return null;

  const { session, summary, expensesByCategory, itemizedSales, itemizedExpenses } = reportData;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `
==============================
BIZFLOW / DEEPKHATA END OF DAY Z-REPORT
==============================
Session ID: ${session.id}
Opened At:  ${new Date(session.openedAt).toLocaleString()}
Closed At:  ${session.closedAt ? new Date(session.closedAt).toLocaleString() : "OPEN / IN PROGRESS"}
Opened By:  ${session.openedBy?.name || "Staff"}
Closed By:  ${session.closedBy?.name || "Staff"}

CASH RECONCILIATION SUMMARY:
------------------------------
Opening Cash Float:  PKR ${summary.openingBalance.toLocaleString()}
Cash Sales Inflow:   +PKR ${summary.cashSales.toLocaleString()}
Cash Expenses Out:   -PKR ${summary.cashExpenses.toLocaleString()}
------------------------------
Expected in Drawer:  PKR ${summary.expectedCash.toLocaleString()}
Counted Physical:    PKR ${summary.actualCash.toLocaleString()}
Difference:          PKR ${summary.difference.toLocaleString()} (${summary.discrepancyType})

EXPENSES BREAKDOWN:
${Object.entries(expensesByCategory || {})
  .map(([cat, val]: any) => `• ${cat}: PKR ${val.total.toLocaleString()} (${val.count} entries)`)
  .join("\n")}

Status: ${summary.discrepancyType === "BALANCED" ? "EXACTLY BALANCED" : summary.discrepancyType}
Notes: ${session.notes || "None"}
==============================
`.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">End of Day Register Z-Report</h2>
              <p className="text-xs text-slate-500">Official Daily Cash Audit & Reconciliation Slip</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              title="Copy text summary for WhatsApp"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy for WhatsApp"}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-800">
          
          {/* Metadata Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 text-sm">Register Session Summary</span>
              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                summary.discrepancyType === "BALANCED"
                  ? "bg-emerald-100 text-emerald-800"
                  : summary.discrepancyType === "SHORTAGE"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {summary.discrepancyType}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
              <div>
                <span className="text-slate-400">Opened: </span>
                <span className="font-medium text-slate-700">{new Date(session.openedAt).toLocaleTimeString()} ({session.openedBy?.name || "Staff"})</span>
              </div>
              <div>
                <span className="text-slate-400">Closed: </span>
                <span className="font-medium text-slate-700">
                  {session.closedAt ? `${new Date(session.closedAt).toLocaleTimeString()} (${session.closedBy?.name || "Staff"})` : "Still Open"}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Branch: </span>
                <span className="font-medium text-slate-700">{session.branch?.name || "Main Shop"}</span>
              </div>
              <div>
                <span className="text-slate-400">Session ID: </span>
                <span className="font-mono text-[11px] text-slate-500 truncate">{session.id.slice(0, 13)}...</span>
              </div>
            </div>
            {session.notes && (
              <div className="pt-2 border-t border-slate-200 text-slate-600 italic">
                &ldquo;{session.notes}&rdquo;
              </div>
            )}
          </div>

          {/* Core Reconciliation Math Grid */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-100/80 px-4 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
              Double-Entry Cash Reconciliation
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-slate-600">1. Opening Cash Float</span>
                <span className="font-mono font-semibold">PKR {summary.openingBalance.toLocaleString()}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-emerald-50/40">
                <span className="text-emerald-800 flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  2. Cash Sales Inflows ({reportData.salesCount} orders)
                </span>
                <span className="font-mono font-bold text-emerald-700">+PKR {summary.cashSales.toLocaleString()}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-rose-50/40">
                <span className="text-rose-800 flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  3. Cash Expenses Outflows ({reportData.expensesCount} receipts)
                </span>
                <span className="font-mono font-bold text-rose-700">-PKR {summary.cashExpenses.toLocaleString()}</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center bg-slate-900 text-white font-bold">
                <span>4. Expected Drawer Balance (1 + 2 - 3)</span>
                <span className="font-mono text-base">PKR {summary.expectedCash.toLocaleString()}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center bg-slate-50">
                <span className="text-slate-700 font-medium">5. Actual Counted Cash</span>
                <span className="font-mono font-bold text-slate-900">PKR {summary.actualCash.toLocaleString()}</span>
              </div>
              <div className={`px-4 py-3 flex justify-between items-center font-bold ${
                summary.difference === 0
                  ? "bg-emerald-100/80 text-emerald-900"
                  : summary.difference < 0
                  ? "bg-rose-100/90 text-rose-900"
                  : "bg-amber-100/90 text-amber-900"
              }`}>
                <span className="flex items-center gap-2">
                  {summary.difference === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4" />}
                  Variance / Discrepancy (5 - 4)
                </span>
                <span className="font-mono text-base">
                  {summary.difference >= 0 ? "+" : ""}PKR {summary.difference.toLocaleString()} ({summary.discrepancyType})
                </span>
              </div>
            </div>
          </div>

          {/* Expenses Category Breakdown */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
              Expenses Breakdown by Category
            </h3>
            {Object.keys(expensesByCategory || {}).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No expenses recorded for this shift.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(expensesByCategory).map(([cat, val]: any) => (
                  <div key={cat} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="text-slate-500 font-medium truncate mb-1">{cat.replace(/_/g, " ")}</div>
                    <div className="font-mono font-bold text-slate-900 text-sm">PKR {val.total.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{val.count} voucher{val.count > 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Itemized Expenses Table */}
          {itemizedExpenses && itemizedExpenses.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Itemized Cash Disbursements
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Staff</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {itemizedExpenses.map((exp: any) => (
                      <tr key={exp.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-500 font-sans">{new Date(exp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-700">{exp.category}</td>
                        <td className="py-2 px-3 font-sans text-slate-600">{exp.description || "-"}</td>
                        <td className="py-2 px-3 font-sans text-slate-500">{exp.createdBy?.name || "Staff"}</td>
                        <td className="py-2 px-3 text-right font-bold text-rose-600">-Rs {exp.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
          >
            Close Report
          </button>
        </div>

      </div>
    </div>
  );
}
