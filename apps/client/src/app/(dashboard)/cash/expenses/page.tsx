"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Receipt,
  Undo2,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { EXPENSE_CATEGORIES, expenseCategoryMeta } from "@/lib/expense-categories";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  createdAt: string;
  createdByName: string | null;
  sessionId: string | null;
  isVoided: boolean;
  voidReason: string | null;
  voidedAt: string | null;
};

type DayRow = {
  date: string;
  total: number;
  count: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
  sessions: Array<{ id: string; openedAt: string; closedAt: string | null }>;
  expenses: ExpenseRow[];
};

const karachiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
    new Date(),
  );

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;

const money = (value: number) => `Rs ${value.toLocaleString()}`;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ExpenseHistoryPage() {
  const { activeBranchId, branches } = useAuth();
  const { toast } = useToast();

  const today = karachiToday();
  const [from, setFrom] = useState(firstOfMonth(today));
  const [to, setTo] = useState(today);
  const [days, setDays] = useState<DayRow[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [voidTarget, setVoidTarget] = useState<ExpenseRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const branchName =
    branches?.find((branch) => branch.id === activeBranchId)?.name ?? null;

  const load = useCallback(async () => {
    if (!activeBranchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(
        `${API_BASE_URL}/cash/expenses/daily?${params.toString()}`,
        {
          credentials: "include",
          headers: getAuthHeaders(activeBranchId),
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to load the expense history.");
      }
      setDays(data.days ?? []);
      setTotal(Number(data.total) || 0);
      setCount(Number(data.count) || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the expense history.",
      );
      setDays([]);
      setTotal(0);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [from, to, activeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDays = useMemo(() => {
    if (categoryFilter === "ALL") return days;
    return days
      .map((day) => {
        const bucket = day.byCategory.find((c) => c.category === categoryFilter);
        return {
          ...day,
          total: bucket?.total ?? 0,
          count: bucket?.count ?? 0,
          expenses: day.expenses.filter((e) => e.category === categoryFilter),
        };
      })
      .filter((day) => day.expenses.length > 0);
  }, [days, categoryFilter]);

  const visibleTotal = categoryFilter === "ALL" ? total : filteredDays.reduce((acc, d) => acc + d.total, 0);
  const visibleCount = categoryFilter === "ALL" ? count : filteredDays.reduce((acc, d) => acc + d.count, 0);

  const exportCsv = () => {
    const rows: string[][] = [
      [
        "Date",
        "Time",
        "Category",
        "Description",
        "Logged by",
        "Amount (PKR)",
        "Voided",
        "Void reason",
      ],
    ];
    for (const day of filteredDays) {
      for (const expense of day.expenses) {
        rows.push([
          day.date,
          timeOf(expense.createdAt),
          expenseCategoryMeta(expense.category).label,
          expense.description ?? "",
          expense.createdByName ?? "",
          String(expense.amount),
          expense.isVoided ? "yes" : "no",
          expense.voidReason ?? "",
        ]);
      }
    }
    const csv = rows
      .map((cols) =>
        cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kharcha-${from}_to_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      setVoidError("Reason must be at least 3 characters.");
      return;
    }
    setIsVoiding(true);
    setVoidError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/cash/expenses/${voidTarget.id}/void`,
        {
          method: "POST",
          credentials: "include",
          headers: getAuthHeaders(activeBranchId),
          body: JSON.stringify({ reason }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to void this expense.");
      }
      toast.success(data.message || "Expense voided.");
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (err) {
      setVoidError(
        err instanceof Error ? err.message : "Failed to void this expense.",
      );
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div data-testid="expenses-page" className="space-y-4 pb-12">
      <PageHeader
        title="Kharcha (Expenses)"
        subtitle="Petty cash history by day for the branch you are working in."
        actions={
          <Button
            variant="secondary"
            size="sm"
            data-testid="expenses-export"
            onClick={exportCsv}
            disabled={filteredDays.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 px-4 py-3">
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700" htmlFor="expenses-from">
              From
            </label>
            <Input
              id="expenses-from"
              data-testid="expenses-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700" htmlFor="expenses-to">
              To
            </label>
            <Input
              id="expenses-to"
              data-testid="expenses-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFrom(firstOfMonth(karachiToday()));
              setTo(karachiToday());
            }}
          >
            <CalendarDays className="h-4 w-4" /> This month
          </Button>
          <div className="ml-auto text-right">
            <p className="text-caption uppercase tracking-wide text-gray-500">
              Total kharcha{branchName ? ` · ${branchName}` : ""}
            </p>
            <p
              data-testid="expenses-total"
              className="font-mono text-title font-semibold text-gray-900"
            >
              {money(visibleTotal)}
            </p>
            <p className="text-caption text-gray-400">{visibleCount} vouchers</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily kharcha</CardTitle>
          <CardDescription>
            Click a day to see every voucher, who logged it and when.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={categoryFilter === "ALL" ? "primary" : "secondary"}
              onClick={() => setCategoryFilter("ALL")}
            >
              All
            </Button>
            {EXPENSE_CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                size="sm"
                data-testid={`expenses-filter-${cat.id}`}
                variant={categoryFilter === cat.id ? "primary" : "secondary"}
                onClick={() => setCategoryFilter(cat.id)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <p className="py-8 text-center text-body text-gray-500">Loading kharcha…</p>
          ) : filteredDays.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent py-8 shadow-none"
              icon={Receipt}
              title="No expenses in this range"
              description="Log petty cash from the Galla page; it shows up here by day."
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border bg-gray-50 px-3 py-2 text-caption font-semibold uppercase tracking-wide text-gray-500 sm:grid-cols-[160px_1fr_auto_auto]">
                <span>Date</span>
                <span className="hidden sm:block">Top categories</span>
                <span className="text-right">Vouchers</span>
                <span className="text-right">Total</span>
              </div>
              {filteredDays.map((day) => {
                const isOpen = expanded === day.date;
                return (
                  <div key={day.date} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      data-testid="expense-day-row"
                      onClick={() => setExpanded(isOpen ? null : day.date)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 sm:grid-cols-[160px_1fr_auto_auto]"
                    >
                      <span className="flex items-center gap-1.5 text-body font-semibold text-gray-900">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        {day.date}
                      </span>
                      <span className="hidden truncate text-caption text-gray-500 sm:block">
                        {day.byCategory
                          .slice(0, 3)
                          .map((c) => expenseCategoryMeta(c.category).label)
                          .join(" · ") || "—"}
                      </span>
                      <span className="text-right font-mono text-caption text-gray-500">
                        {day.count}
                      </span>
                      <span className="text-right font-mono text-body font-semibold text-gray-900">
                        {money(day.total)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="space-y-1.5 border-t border-border bg-gray-50 px-3 py-2">
                        {day.expenses.length === 0 ? (
                          <p className="text-caption text-gray-500">
                            No vouchers for this filter.
                          </p>
                        ) : (
                          day.expenses.map((expense) => {
                            const meta = expenseCategoryMeta(expense.category);
                            const Icon = meta.icon;
                            return (
                              <div
                                key={expense.id}
                                data-testid="expense-row"
                                className={`flex items-center justify-between gap-3 rounded-md border border-border bg-card px-2.5 py-2 ${
                                  expense.isVoided ? "opacity-60" : ""
                                }`}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 rounded-md border border-border bg-gray-50 p-1.5 text-gray-600">
                                    <Icon className="h-3.5 w-3.5" />
                                  </span>
                                  <div className="min-w-0">
                                    <p
                                      className={`truncate text-body font-semibold text-gray-900 ${
                                        expense.isVoided ? "line-through" : ""
                                      }`}
                                    >
                                      {expense.description || meta.label}
                                    </p>
                                    <p className="text-caption text-gray-400">
                                      {timeOf(expense.createdAt)} ·{" "}
                                      {expense.createdByName || "Staff"} ·{" "}
                                      {meta.label}
                                      {expense.isVoided && (
                                        <span data-testid="expense-voided-badge">
                                          {" "}
                                          · Voided
                                          {expense.voidReason
                                            ? `: ${expense.voidReason}`
                                            : ""}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span
                                    className={`font-mono text-body font-semibold ${
                                      expense.isVoided
                                        ? "text-gray-400 line-through"
                                        : "text-danger"
                                    }`}
                                  >
                                    -{money(expense.amount)}
                                  </span>
                                  {!expense.isVoided && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      data-testid="expense-void"
                                      onClick={() => {
                                        setVoidTarget(expense);
                                        setVoidReason("");
                                        setVoidError(null);
                                      }}
                                    >
                                      <Undo2 className="h-3.5 w-3.5" /> Void
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2.5 text-body font-semibold text-gray-900">
                <span>Total</span>
                <span data-testid="expenses-footer-total" className="font-mono">
                  {money(visibleTotal)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {voidTarget && (
        <div
          data-testid="expense-void-dialog"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-overlay">
            <h2 className="text-subtitle font-semibold text-gray-900">
              Void this expense?
            </h2>
            <p className="mt-1 text-body text-gray-500">
              The voucher stays in history and is removed from the galla totals.
              To correct the amount, void it and log the right one.
            </p>
            <p className="mt-2 text-body font-semibold text-gray-900">
              {voidTarget.description || expenseCategoryMeta(voidTarget.category).label} ·{" "}
              {money(voidTarget.amount)}
            </p>
            <label className="mt-3 mb-1 block text-caption font-medium text-gray-700" htmlFor="expense-void-reason">
              Reason
            </label>
            <Textarea
              id="expense-void-reason"
              data-testid="expense-void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong amount, chai was Rs 300"
            />
            {voidError && (
              <p data-testid="expense-void-error" className="mt-2 text-caption font-medium text-danger">
                {voidError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setVoidTarget(null)}
                disabled={isVoiding}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                data-testid="expense-void-confirm"
                onClick={() => void handleVoid()}
                disabled={isVoiding || voidReason.trim().length < 3}
              >
                {isVoiding ? "Voiding…" : "Void expense"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
