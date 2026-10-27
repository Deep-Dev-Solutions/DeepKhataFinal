"use client";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { enqueue } from "@/lib/sync/queue";

import { useState, useEffect, useCallback } from "react";
import {
  Banknote,
  Coffee,
  Bike,
  Wrench,
  Package,
  Zap,
  Tag,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Unlock,
  Lock,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Calculator,
} from "lucide-react";
import CloseRegisterModal from "@/components/modals/CloseRegisterModal";
import OpenRegisterModal from "@/components/modals/OpenRegisterModal";
import ZReportModal from "@/components/modals/ZReportModal";
import AlertDialog from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const EXPENSE_CATEGORIES = [
  {
    id: "CHAI_REFRESHMENT",
    label: "Chai / Tea",
    icon: Coffee,
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  {
    id: "DELIVERY_RIDER",
    label: "Delivery Rider",
    icon: Bike,
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    id: "REPAIR_PARTS",
    label: "Parts / Shop",
    icon: Wrench,
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  {
    id: "SUPPLIES",
    label: "Packaging",
    icon: Package,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    id: "UTILITIES",
    label: "Bills / Power",
    icon: Zap,
    color: "text-orange-700 bg-orange-50 border-orange-200",
  },
  {
    id: "OTHER",
    label: "Other Expense",
    icon: Tag,
    color: "text-slate-700 bg-slate-50 border-slate-200",
  },
];

export default function CashHubPage() {
  const { activeBranchId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registerStatus, setRegisterStatus] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  // Expense Form State
  const [category, setCategory] = useState("CHAI_REFRESHMENT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [branchId, setBranchId] = useState("");
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [expenseSuccessMsg, setExpenseSuccessMsg] = useState<string | null>(
    null,
  );

  // Modals
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isZReportModalOpen, setIsZReportModalOpen] = useState(false);
  const [currentZReport, setCurrentZReport] = useState<any>(null);
  const [messageAlert, setMessageAlert] = useState<{
    title: string;
    description: string;
  } | null>(null);

  // Filters
  const [selectedFilterCategory, setSelectedFilterCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");



  const fetchCashData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders(activeBranchId);

      // Fetch Register Status
      const statusRes = await fetch(`${API_BASE_URL}/cash/register/status`, {
        credentials: "include",
        headers,
      });
      const statusData = await statusRes.json();
      if (statusData.success) {
        setRegisterStatus(statusData);
      }

      // Fetch Expenses
      const expRes = await fetch(`${API_BASE_URL}/cash/expenses`, { credentials: "include",  headers });
      const expData = await expRes.json();
      if (expData.success) {
        setExpenses(expData.expenses);
      }

      // Fetch Branches for selector
      const branchRes = await fetch(`${API_BASE_URL}/product/getbranches`, {
        credentials: "include",
        headers,
      });
      const branchData = await branchRes.json();
      if (branchData.success) {
        setBranches(branchData.branches);
      }
    } catch (err) {
      console.error("Error fetching cash hub data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    fetchCashData();
  }, [fetchCashData]);

  // Log Expense Handler
  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setSubmittingExpense(true);
    setExpenseSuccessMsg(null);

    const expenseId = crypto.randomUUID();
    const expensePayload = {
      amount: numAmount,
      category,
      description: description.trim() || undefined,
      branchId: branchId || activeBranchId || undefined,
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue("CREATE_EXPENSE", expensePayload, expenseId);
      setAmount("");
      setDescription("");
      setExpenseSuccessMsg(
        `✓ PKR ${numAmount.toLocaleString()} recorded & queued offline!`,
      );
      setTimeout(() => setExpenseSuccessMsg(null), 4000);
      setSubmittingExpense(false);
      return;
    }

    try {
      const headers = getAuthHeaders(activeBranchId);
      const res = await fetch(`${API_BASE_URL}/cash/expense`, {
        credentials: "include",
        method: "POST",
        headers,
        body: JSON.stringify(expensePayload),
      });

      const data = await res.json();
      if (data.success) {
        setAmount("");
        setDescription("");
        setExpenseSuccessMsg(
          `✓ PKR ${numAmount.toLocaleString()} recorded & balanced in ledger!`,
        );
        setTimeout(() => setExpenseSuccessMsg(null), 4000);
        await fetchCashData();
      } else {
        setMessageAlert({
          title: "Could Not Log Expense",
          description: data.message || "Failed to log expense",
        });
      }
    } catch (err) {
      const isNetworkErr =
        err instanceof TypeError ||
        (typeof navigator !== "undefined" && !navigator.onLine);
      if (isNetworkErr) {
        await enqueue("CREATE_EXPENSE", expensePayload, expenseId);
        setAmount("");
        setDescription("");
        setExpenseSuccessMsg(
          `✓ PKR ${numAmount.toLocaleString()} recorded & queued offline!`,
        );
        setTimeout(() => setExpenseSuccessMsg(null), 4000);
        return;
      }
      console.error(err);
      setMessageAlert({
        title: "Connection Error",
        description:
          "Error recording expense. Please check your connection.",
      });
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Open Register Handler
  const handleOpenRegister = async (data: {
    openingBalance: number;
    notes?: string;
  }) => {
    const headers = getAuthHeaders(activeBranchId);
    const res = await fetch(`${API_BASE_URL}/cash/register/open`, {
      credentials: "include",
      method: "POST",
      headers,
      body: JSON.stringify({
        openingBalance: data.openingBalance,
        notes: data.notes,
        branchId: branchId || activeBranchId || undefined,
      }),
    });
    const result = await res.json();
    if (result.success) {
      await fetchCashData();
    } else {
      setMessageAlert({
        title: "Could Not Open Register",
        description: result.message || "Failed to open register",
      });
    }
  };

  // Close Register Handler
  const handleCloseRegister = async (data: {
    actualCash: number;
    notes?: string;
  }) => {
    const headers = getAuthHeaders(activeBranchId);
    const res = await fetch(`${API_BASE_URL}/cash/register/close`, {
      credentials: "include",
      method: "POST",
      headers,
      body: JSON.stringify({
        actualCash: data.actualCash,
        notes: data.notes,
        branchId: branchId || activeBranchId || undefined,
      }),
    });
    const result = await res.json();
    if (result.success) {
      await fetchCashData();
      // Fetch and display Z-report
      await handleViewZReport(result.session.id);
    } else {
      setMessageAlert({
        title: "Could Not Close Register",
        description: result.message || "Failed to close register",
      });
    }
  };

  // View Z-Report Handler
  const handleViewZReport = async (sessionId?: string) => {
    try {
      const headers = getAuthHeaders(activeBranchId);
      const url = sessionId
        ? `${API_BASE_URL}/cash/register/z-report?sessionId=${sessionId}`
        : `${API_BASE_URL}/cash/register/z-report`;
      const res = await fetch(url, { credentials: "include",  headers });
      const data = await res.json();
      if (data.success) {
        setCurrentZReport(data.report);
        setIsZReportModalOpen(true);
      } else {
        setMessageAlert({
          title: "No Z-Report Available",
          description: data.message || "No report available",
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredExpenses = expenses.filter((exp) => {
    const matchesCat =
      selectedFilterCategory === "ALL" ||
      exp.category === selectedFilterCategory;
    const matchesSearch =
      !searchQuery ||
      exp.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const quickAmounts = [50, 100, 200, 500, 1000];

  return (
    <div data-testid="cash-page" className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Cash Hub & Register"
        subtitle="Petty-cash expense vouchers and end-of-day (Z-Report) drawer reconciliation."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="cash-register-status"
              className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2 text-caption font-semibold ${
                registerStatus?.isOpen
                  ? "border-success/30 bg-success-bg text-success-fg"
                  : "border-border bg-gray-100 text-gray-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${registerStatus?.isOpen ? "bg-success" : "bg-gray-400"}`}
              />
              {registerStatus?.isOpen ? "Shift Active (Drawer Open)" : "Register Closed"}
            </span>

            <Button
              data-testid="cash-zreport"
              variant="secondary"
              size="sm"
              onClick={() => handleViewZReport()}
            >
              <FileText className="h-4 w-4" /> Z-Report
            </Button>

            {registerStatus?.isOpen ? (
              <Button
                data-testid="cash-close-register"
                variant="danger"
                size="sm"
                onClick={() => setIsCloseModalOpen(true)}
              >
                <Lock className="h-3.5 w-3.5" /> Close Register
              </Button>
            ) : (
              <Button
                data-testid="cash-open-register"
                size="sm"
                onClick={() => setIsOpenModalOpen(true)}
              >
                <Unlock className="h-3.5 w-3.5" /> Start Shift
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={fetchCashData}
              title="Refresh drawer numbers"
              aria-label="Refresh drawer numbers"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Opening Float
              </span>
              <Clock className="h-3.5 w-3.5 text-gray-400" />
            </div>
            <p className="font-mono text-title font-semibold text-gray-900">
              PKR {(registerStatus?.openingBalance || 0).toLocaleString()}
            </p>
            <p className="text-caption text-gray-400">
              {registerStatus?.isOpen
                ? `Opened at ${new Date(registerStatus.session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Initial drawer base"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Cash Sales Inflows
              </span>
              <ArrowUpRight
                className={`h-3.5 w-3.5 ${(registerStatus?.cashSales || 0) > 0 ? "text-success" : "text-gray-400"}`}
              />
            </div>
            <p
              className={`font-mono text-title font-semibold ${(registerStatus?.cashSales || 0) > 0 ? "text-success" : "text-gray-900"}`}
            >
              +PKR {(registerStatus?.cashSales || 0).toLocaleString()}
            </p>
            <p className="text-caption text-gray-400">
              From {registerStatus?.salesCount || 0} cash orders & payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Cash Expenses Out
              </span>
              <ArrowDownRight
                className={`h-3.5 w-3.5 ${(registerStatus?.cashExpenses || 0) > 0 ? "text-danger" : "text-gray-400"}`}
              />
            </div>
            <p
              className={`font-mono text-title font-semibold ${(registerStatus?.cashExpenses || 0) > 0 ? "text-danger" : "text-gray-900"}`}
            >
              -PKR {(registerStatus?.cashExpenses || 0).toLocaleString()}
            </p>
            <p className="text-caption text-gray-400">
              {registerStatus?.expensesCount || 0} petty cash disbursements
            </p>
          </CardContent>
        </Card>

        <Card className="border-brand-700 bg-brand-700 text-white">
          <CardContent className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-brand-100">
                Expected in Drawer
              </span>
              <span className="rounded bg-brand-800 px-1.5 py-0.5 font-mono text-[10px] text-brand-100">
                Live ledger
              </span>
            </div>
            <p className="font-mono text-title font-semibold">
              PKR {(registerStatus?.expectedCash || 0).toLocaleString()}
            </p>
            <p className="pt-1.5 text-caption text-brand-100">
              Float + sales − expenses · must match physical cash
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Quick Expense Voucher</CardTitle>
            <CardDescription>
              Pulling petty cash for chai, rider or parts? Log it here — the entry
              posts to the ledger, balanced.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogExpense} className="space-y-3">
              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Expense Category
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <Button
                        key={cat.id}
                        type="button"
                        size="sm"
                        variant={isSelected ? "primary" : "secondary"}
                        onClick={() => setCategory(cat.id)}
                        className="justify-start"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Amount (PKR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-gray-400">
                    PKR
                  </span>
                  <Input
                    data-testid="cash-expense-amount"
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 500"
                    className="pl-12 font-mono font-semibold"
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {quickAmounts.map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-caption"
                      onClick={() =>
                        setAmount(String((parseFloat(amount) || 0) + amt))
                      }
                    >
                      +{amt}
                    </Button>
                  ))}
                  {amount && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 px-2 text-caption text-danger hover:bg-danger-bg"
                      onClick={() => setAmount("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Description / Shop Notes
                </label>
                <Input
                  data-testid="cash-expense-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 5 teas from Butt Tea Stall for customers"
                />
              </div>

              {branches.length > 0 && (
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Shop Branch
                  </label>
                  <Select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">All Branches / Main Counter</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {expenseSuccessMsg && (
                <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-bg px-3 py-2 text-body font-medium text-success-fg">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {expenseSuccessMsg}
                </div>
              )}

              <Button
                data-testid="cash-expense-submit"
                type="submit"
                disabled={submittingExpense || !amount}
                loading={submittingExpense}
                className="w-full"
              >
                {!submittingExpense && <Plus className="h-4 w-4" />}
                Record Cash Expense
              </Button>

              <p className="text-center text-caption italic text-gray-400">
                Debits expense account · credits cash drawer (zero-sum balanced)
              </p>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Today&apos;s Expense Ledger</CardTitle>
            <CardDescription>
              Chronological log of petty cash disbursements
            </CardDescription>
            <CardAction>
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  size="sm"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                  className="pl-8"
                />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={selectedFilterCategory === "ALL" ? "primary" : "secondary"}
                onClick={() => setSelectedFilterCategory("ALL")}
              >
                All ({expenses.length})
              </Button>
              {EXPENSE_CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  size="sm"
                  variant={
                    selectedFilterCategory === cat.id ? "primary" : "secondary"
                  }
                  onClick={() => setSelectedFilterCategory(cat.id)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {filteredExpenses.length === 0 ? (
              <EmptyState
                className="border-0 bg-transparent py-8 shadow-none"
                icon={Coffee}
                title="No expenses logged yet for today"
                description="Use the quick form to record daily chai or rider expenses."
              />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {filteredExpenses.map((exp) => {
                  const catMeta =
                    EXPENSE_CATEGORIES.find((c) => c.id === exp.category) ||
                    EXPENSE_CATEGORIES[5];
                  const Icon = catMeta.icon;

                  return (
                    <div
                      data-testid="cash-expense-row"
                      key={exp.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="shrink-0 rounded-md border border-border bg-gray-50 p-1.5 text-gray-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-body font-semibold text-gray-900">
                              {exp.description || catMeta.label}
                            </span>
                            <Badge variant="neutral">{catMeta.label}</Badge>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-caption text-gray-400">
                            <span>
                              {new Date(exp.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span>·</span>
                            <span>By {exp.createdBy?.name || "Staff"}</span>
                            {exp.branch && (
                              <>
                                <span>·</span>
                                <span>{exp.branch.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="font-mono text-body font-semibold text-danger">
                          -Rs {exp.amount.toLocaleString()}
                        </div>
                        <div className="flex items-center justify-end gap-1 text-caption text-gray-400">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Balanced
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CloseRegisterModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        expectedCash={registerStatus?.expectedCash || 0}
        openingBalance={registerStatus?.openingBalance || 0}
        cashSales={registerStatus?.cashSales || 0}
        cashExpenses={registerStatus?.cashExpenses || 0}
        onConfirmClose={handleCloseRegister}
      />

      <OpenRegisterModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onConfirmOpen={handleOpenRegister}
      />

      <ZReportModal
        isOpen={isZReportModalOpen}
        onClose={() => setIsZReportModalOpen(false)}
        reportData={currentZReport}
      />

      <AlertDialog
        isOpen={messageAlert !== null}
        title={messageAlert?.title || ""}
        description={
          <div data-testid="cash-alert">
            <span data-testid="cash-alert-description">
              {messageAlert?.description || ""}
            </span>
          </div>
        }
        icon={<AlertTriangle className="w-6 h-6" />}
        onClose={() => setMessageAlert(null)}
      />
    </div>
  );
}
