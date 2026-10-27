"use client";

import { useState } from "react";
import {
  Printer,
  Copy,
  Check,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ZReportData, ExpenseCategory, ItemizedExpense } from "@/types/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  reportData: ZReportData;
};

export default function ZReportModal({ isOpen, onClose, reportData }: Props) {
  const [copied, setCopied] = useState(false);

  if (!reportData) return null;

  const {
    session,
    summary,
    expensesByCategory,
    itemizedSales,
    itemizedExpenses,
  } = reportData;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `
==============================
DEEPKHATA END OF DAY Z-REPORT
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
  .map(
    ([cat, val]: [string, ExpenseCategory]) =>
      `• ${cat}: PKR ${val.total.toLocaleString()} (${val.count} entries)`,
  )
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
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-testid="zreport-modal"
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-700" />
          End of Day Z-Report
        </span>
      }
      description="Official daily cash audit and reconciliation slip."
      footer={
        <Button data-testid="zreport-close" variant="secondary" onClick={onClose}>
          Close Report
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyText}
            title="Copy text summary for WhatsApp"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied!" : "Copy for WhatsApp"}
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-gray-50 p-3 text-caption">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-body font-semibold text-gray-900">
              Register Session Summary
            </span>
            <Badge
              variant={
                summary.discrepancyType === "BALANCED"
                  ? "success"
                  : summary.discrepancyType === "SHORTAGE"
                    ? "danger"
                    : "warning"
              }
              uppercase
            >
              {summary.discrepancyType}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <div>
              <span className="text-gray-400">Opened: </span>
              <span className="font-medium text-gray-700">
                {new Date(session.openedAt).toLocaleTimeString()} (
                {session.openedBy?.name || "Staff"})
              </span>
            </div>
            <div>
              <span className="text-gray-400">Closed: </span>
              <span className="font-medium text-gray-700">
                {session.closedAt
                  ? `${new Date(session.closedAt).toLocaleTimeString()} (${session.closedBy?.name || "Staff"})`
                  : "Still Open"}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Branch: </span>
              <span className="font-medium text-gray-700">
                {session.branch?.name || "Main Shop"}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Session ID: </span>
              <span className="truncate font-mono text-caption text-gray-500">
                {session.id.slice(0, 13)}...
              </span>
            </div>
          </div>
          {session.notes && (
            <div className="border-t border-border pt-2 italic text-gray-600">
              &ldquo;{session.notes}&rdquo;
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-gray-50 px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-gray-600">
            Double-Entry Cash Reconciliation
          </div>
          <div className="divide-y divide-border text-body">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-gray-600">1. Opening Cash Float</span>
              <span className="font-mono font-semibold">
                PKR {summary.openingBalance.toLocaleString()}
              </span>
            </div>
            <div
              data-testid="zreport-total-sales"
              className="flex items-center justify-between bg-gray-50 px-3 py-2"
            >
              <span className="flex items-center gap-1.5 text-gray-700">
                <ArrowUpRight className="h-4 w-4 text-success" />
                2. Cash Sales Inflows ({reportData.salesCount} orders)
              </span>
              <span
                className={`font-mono font-semibold ${summary.cashSales > 0 ? "text-success" : "text-gray-900"}`}
              >
                +PKR {summary.cashSales.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
              <span className="flex items-center gap-1.5 text-gray-700">
                <ArrowDownRight className="h-4 w-4 text-danger" />
                3. Cash Expenses Outflows ({reportData.expensesCount} receipts)
              </span>
              <span className="font-mono font-semibold text-danger">
                -PKR {summary.cashExpenses.toLocaleString()}
              </span>
            </div>
            <div
              data-testid="zreport-expected-cash"
              className="flex items-center justify-between bg-brand-700 px-3 py-2.5 font-semibold text-white"
            >
              <span>4. Expected Drawer Balance (1 + 2 − 3)</span>
              <span className="font-mono">
                PKR {summary.expectedCash.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-700">
                5. Actual Counted Cash
              </span>
              <span className="font-mono font-semibold text-gray-900">
                PKR {summary.actualCash.toLocaleString()}
              </span>
            </div>
            <div
              className={`flex items-center justify-between px-3 py-2.5 font-semibold ${
                summary.difference === 0
                  ? "bg-success-bg text-success-fg"
                  : summary.difference < 0
                    ? "bg-danger-bg text-danger-fg"
                    : "bg-warning-bg text-warning-fg"
              }`}
            >
              <span className="flex items-center gap-2">
                {summary.difference === 0 ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                Variance / Discrepancy (5 − 4)
              </span>
              <span className="font-mono">
                {summary.difference >= 0 ? "+" : ""}PKR{" "}
                {summary.difference.toLocaleString()} ({summary.discrepancyType})
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-gray-600">
            Expenses Breakdown by Category
          </h3>
          {Object.keys(expensesByCategory || {}).length === 0 ? (
            <p className="text-caption italic text-gray-400">
              No expenses recorded for this shift.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(expensesByCategory).map(
                ([cat, val]: [string, ExpenseCategory]) => (
                  <div
                    key={cat}
                    className="rounded-md border border-border bg-gray-50 p-2.5 text-caption"
                  >
                    <div className="mb-0.5 truncate font-medium text-gray-500">
                      {cat.replace(/_/g, " ")}
                    </div>
                    <div className="font-mono text-body font-semibold text-gray-900">
                      PKR {val.total.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {val.count} voucher{val.count > 1 ? "s" : ""}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {itemizedExpenses && itemizedExpenses.length > 0 && (
          <div>
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-gray-600">
              Itemized Cash Disbursements
            </h3>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16">Time</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemizedExpenses.map((exp: ItemizedExpense) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-gray-500">
                        {new Date(exp.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-gray-700">
                        {exp.category}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-gray-600">
                        {exp.description || "-"}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {exp.createdBy?.name || "Staff"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-danger">
                        -Rs {exp.amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
