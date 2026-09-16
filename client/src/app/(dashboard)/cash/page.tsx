"use client";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

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

  // Filters
  const [selectedFilterCategory, setSelectedFilterCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const getHeaders = () => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchCashData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getHeaders();

      // Fetch Register Status
      const statusRes = await fetch(`${API_BASE_URL}/cash/register/status`, {
        headers,
      });
      const statusData = await statusRes.json();
      if (statusData.success) {
        setRegisterStatus(statusData);
      }

      // Fetch Expenses
      const expRes = await fetch(`${API_BASE_URL}/cash/expenses`, { headers });
      const expData = await expRes.json();
      if (expData.success) {
        setExpenses(expData.expenses);
      }

      // Fetch Branches for selector
      const branchRes = await fetch(`${API_BASE_URL}/product/getbranches`, {
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
  }, []);

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
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_BASE_URL}/cash/expense`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: numAmount,
          category,
          description: description.trim() || undefined,
          branchId: branchId || undefined,
        }),
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
        alert(data.message || "Failed to log expense");
      }
    } catch (err) {
      console.error(err);
      alert("Error recording expense. Please check your connection.");
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Open Register Handler
  const handleOpenRegister = async (data: {
    openingBalance: number;
    notes?: string;
  }) => {
    const headers = getHeaders();
    const res = await fetch(`${API_BASE_URL}/cash/register/open`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        openingBalance: data.openingBalance,
        notes: data.notes,
        branchId: branchId || undefined,
      }),
    });
    const result = await res.json();
    if (result.success) {
      await fetchCashData();
    } else {
      alert(result.message || "Failed to open register");
    }
  };

  // Close Register Handler
  const handleCloseRegister = async (data: {
    actualCash: number;
    notes?: string;
  }) => {
    const headers = getHeaders();
    const res = await fetch(`${API_BASE_URL}/cash/register/close`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        actualCash: data.actualCash,
        notes: data.notes,
        branchId: branchId || undefined,
      }),
    });
    const result = await res.json();
    if (result.success) {
      await fetchCashData();
      // Fetch and display Z-report
      await handleViewZReport(result.session.id);
    } else {
      alert(result.message || "Failed to close register");
    }
  };

  // View Z-Report Handler
  const handleViewZReport = async (sessionId?: string) => {
    try {
      const headers = getHeaders();
      const url = sessionId
        ? `${API_BASE_URL}/cash/register/z-report?sessionId=${sessionId}`
        : `${API_BASE_URL}/cash/register/z-report`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) {
        setCurrentZReport(data.report);
        setIsZReportModalOpen(true);
      } else {
        alert(data.message || "No report available");
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm shadow-blue-200">
              <Banknote className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Cash Hub & Register Management
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Double-entry operational cash expense tracking and End of Day
            (Z-Report) drawer reconciliation.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Shift Status Pill */}
          <div
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border ${
              registerStatus?.isOpen
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${registerStatus?.isOpen ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
            />
            {registerStatus?.isOpen
              ? "Shift Active (Drawer Open)"
              : "Register Closed"}
          </div>

          <button
            onClick={() => handleViewZReport()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            Z-Report Audit
          </button>

          {registerStatus?.isOpen ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              Close Register (Z-Report)
            </button>
          ) : (
            <button
              onClick={() => setIsOpenModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all"
            >
              <Unlock className="w-3.5 h-3.5" />
              Start Shift / Open Drawer
            </button>
          )}

          <button
            onClick={fetchCashData}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
            title="Refresh drawer numbers"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Live KPI Drawer Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Opening Float */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Opening Cash Float</span>
            <span className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900">
            PKR {(registerStatus?.openingBalance || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {registerStatus?.isOpen
              ? `Opened at ${new Date(registerStatus.session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Initial drawer base"}
          </div>
        </div>

        {/* Card 2: Cash Inflows (Sales) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Cash Sales Inflows</span>
            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-extrabold font-mono text-emerald-600">
            +PKR {(registerStatus?.cashSales || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            From {registerStatus?.salesCount || 0} cash orders & payments
          </div>
        </div>

        {/* Card 3: Cash Outflows (Expenses) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Cash Expenses Out</span>
            <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
              <ArrowDownRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-extrabold font-mono text-rose-600">
            -PKR {(registerStatus?.cashExpenses || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {registerStatus?.expensesCount || 0} petty cash disbursements
          </div>
        </div>

        {/* Card 4: Expected Cash in Drawer */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">
                Expected in Drawer
              </span>
              <span className="px-2 py-0.5 bg-slate-800 text-[10px] rounded text-emerald-400 font-mono">
                Live Ledger
              </span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-400">
              PKR {(registerStatus?.expectedCash || 0).toLocaleString()}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
            <span>Float + Sales - Expenses</span>
            <span className="text-slate-300 font-semibold">
              Must match physical cash
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Quick Operational Expense Entry Form (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Coffee className="w-5 h-5 text-amber-600" />
              Quick Expense Voucher
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pulling petty cash from drawer for chai, rider, or parts? Log it
              here to balance the double-entry ledger.
            </p>
          </div>

          <form onSubmit={handleLogExpense} className="space-y-4">
            {/* Category Chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Expense Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-xs font-semibold transition-all text-left ${
                        isSelected
                          ? `${cat.color} ring-2 ring-blue-500/20 shadow-xs`
                          : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100/60"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Amount (PKR)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  PKR
                </span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full pl-14 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-base text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Quick Rupees Addition Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() =>
                      setAmount(String((parseFloat(amount) || 0) + amt))
                    }
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                  >
                    +{amt}
                  </button>
                ))}
                {amount && (
                  <button
                    type="button"
                    onClick={() => setAmount("")}
                    className="text-[11px] px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 font-medium ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Description / Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Description / Shop Notes
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 5 teas from Butt Tea Stall for customers"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Branch Selector (if multiple branches exist) */}
            {branches.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Shop Branch
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Branches / Main Counter</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Feedback Message */}
            {expenseSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {expenseSuccessMsg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submittingExpense || !amount}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {submittingExpense
                ? "Posting to Ledger..."
                : "Record Cash Expense & Debit Ledger"}
            </button>

            <p className="text-[11px] text-slate-400 text-center italic">
              Posting: Debits Expense Account • Credits Cash Drawer (Zero-Sum
              Balanced)
            </p>
          </form>
        </div>

        {/* RIGHT: Today's Expense Disbursements Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Today&apos;s Expense Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Chronological log of petty cash disbursements
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedFilterCategory("ALL")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedFilterCategory === "ALL"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({expenses.length})
            </button>
            {EXPENSE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedFilterCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedFilterCategory === cat.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Expenses List */}
          {filteredExpenses.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Coffee className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">
                No expenses logged yet for today.
              </p>
              <p className="text-[11px] text-slate-400">
                Use the quick form on the left to record daily chai or rider
                expenses.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {filteredExpenses.map((exp) => {
                const catMeta =
                  EXPENSE_CATEGORIES.find((c) => c.id === exp.category) ||
                  EXPENSE_CATEGORIES[5];
                const Icon = catMeta.icon;

                return (
                  <div
                    key={exp.id}
                    className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-xl border shrink-0 ${catMeta.color}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900 truncate">
                            {exp.description || catMeta.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-mono text-slate-600">
                            {catMeta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>
                            {new Date(exp.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>•</span>
                          <span>By {exp.createdBy?.name || "Staff"}</span>
                          {exp.branch && (
                            <>
                              <span>•</span>
                              <span>{exp.branch.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-rose-600">
                        -Rs {exp.amount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-emerald-600 font-medium flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Balanced
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Close Register Modal */}
      <CloseRegisterModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        expectedCash={registerStatus?.expectedCash || 0}
        openingBalance={registerStatus?.openingBalance || 0}
        cashSales={registerStatus?.cashSales || 0}
        cashExpenses={registerStatus?.cashExpenses || 0}
        onConfirmClose={handleCloseRegister}
      />

      {/* Open Register Modal */}
      <OpenRegisterModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onConfirmOpen={handleOpenRegister}
      />

      {/* End of Day Z-Report Modal */}
      <ZReportModal
        isOpen={isZReportModalOpen}
        onClose={() => setIsZReportModalOpen(false)}
        reportData={currentZReport}
      />
    </div>
  );
}
