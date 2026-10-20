"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  Building2,
  Users,
  ShoppingBag,
  Receipt,
  Plus,
  GitBranch,
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2,
  X,
  Download,
  ExternalLink,
  Activity,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import type {
  TenantRow,
  OverviewAnalytics,
} from "@/types/agency";

interface Branch {
  id: string;
  name: string;
  location: string | null;
  createdAt: string;
}

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  TRIALING: "bg-blue-50 text-blue-700 border-blue-200",
  PAST_DUE: "bg-amber-50 text-amber-700 border-amber-200",
  READ_ONLY: "bg-amber-50 text-amber-700 border-amber-200",
  SUSPENDED: "bg-rose-50 text-rose-700 border-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
};

const PLAN_FIT_BADGES: Record<string, { label: string; class: string }> = {
  UPGRADE_CANDIDATE: {
    label: "Upgrade candidate",
    class: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  CHURN_RISK: {
    label: "Churn risk",
    class: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

function formatGmv(amount: string | number | undefined): string {
  if (amount === undefined || amount === null) return "Rs 0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `Rs ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function AgencyAdminPage() {
  const { token, isLoading: isAuthLoading } = useAuth();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("name");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [viewAsLoadingId, setViewAsLoadingId] = useState<string | null>(null);

  // New tenant form state
  const [formData, setFormData] = useState({
    businessName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    phone: "",
    address: "",
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  // Branch provisioning state
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [branchModalFor, setBranchModalFor] = useState<TenantRow | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [branchSubmitLoading, setBranchSubmitLoading] = useState(false);
  const [branchError, setBranchError] = useState("");

  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.get<OverviewAnalytics>("/agency/analytics/overview");
      setOverview(data);
    } catch (err) {
      console.error("Failed to fetch overview analytics:", err);
    }
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filter && filter !== "all") queryParams.set("filter", filter);
      if (sort && sort !== "name") queryParams.set("sort", sort);
      const url = `/agency/analytics/tenants${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const data = await api.get<TenantRow[]>(url);
      setTenants(data);
    } catch (err) {
      console.error("Failed to fetch tenants:", err);
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => {
    const load = async () => {
      if (token) {
        await Promise.all([fetchOverview(), fetchTenants()]);
      } else if (!isAuthLoading) {
        setLoading(false);
      }
    };
    load().catch(console.error);
  }, [token, isAuthLoading, fetchOverview, fetchTenants]);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const queryParams = new URLSearchParams({ format: "csv" });
      if (filter && filter !== "all") queryParams.set("filter", filter);
      if (sort && sort !== "name") queryParams.set("sort", sort);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/agency/analytics/tenants?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("CSV export failed");
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "tenants-analytics.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("CSV export failed:", err);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleViewAs = async (businessId: string) => {
    setViewAsLoadingId(businessId);
    try {
      const res = await api.post<{ token: string; url: string; expiresAt: string }>(
        `/agency/tenants/${businessId}/view-as`
      );
      if (res?.url) {
        window.open(res.url, "_blank");
      }
    } catch (err) {
      console.error("View as failed:", err);
    } finally {
      setViewAsLoadingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setError("");

    try {
      await api.post("/agency/onboard-tenant", formData);
      await Promise.all([fetchOverview(), fetchTenants()]);
      setIsModalOpen(false);
      setFormData({
        businessName: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        phone: "",
        address: "",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to onboard tenant");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchModalFor || !branchName.trim()) return;
    setBranchSubmitLoading(true);
    setBranchError("");

    try {
      await api.post(`/agency/branch/${branchModalFor.businessId}`, {
        name: branchName,
        location: branchLocation,
        override: true,
      });
      await fetchTenants();
      setBranchModalFor(null);
      setBranchName("");
      setBranchLocation("");
    } catch (err: unknown) {
      setBranchError(err instanceof Error ? err.message : "Failed to add branch");
    } finally {
      setBranchSubmitLoading(false);
    }
  };

  const filteredTenants = tenants.filter((t) =>
    search ? t.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading tenants...
      </div>
    );
  }

  return (
    <div data-testid="tenants-page" className="space-y-6 animate-in fade-in duration-500">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tenants Overview & Analytics
          </h2>
          <p className="text-slate-500 mt-1">
            Real-time usage, plan health, and revenue analytics across all businesses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            data-testid="tenants-export-csv"
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3.5 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            {exportingCsv ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export CSV
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            data-testid="tenant-onboard"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Provision New Tenant
          </button>
        </div>
      </div>

      {/* ── Overview Metrics Cards ────────────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">MRR</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              Rs {Number(overview.mrr).toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1">Active subscriptions</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">30d GMV</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {formatGmv(overview.totalGmv30)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Total system throughput</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">New Trials</span>
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {overview.trialsStartedThisMonth}
            </div>
            <p className="text-xs text-slate-500 mt-1">Started this month</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Conversion</span>
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {Math.round(overview.trialToPaid * 100)}%
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {overview.trialToPaidCounts?.converted || 0} / {overview.trialToPaidCounts?.started || 0} converted
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Churned (30d)</span>
              <AlertCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {overview.churned}
            </div>
            <p className="text-xs text-slate-500 mt-1">Cancelled or lost</p>
          </div>
        </div>
      )}

      {/* ── Filters & Search Bar ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search tenant name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Filter:</span>
            <select
              data-testid="tenants-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Tenants</option>
              <option value="trialing">Trialing</option>
              <option value="expiring7">Expiring in 7 days</option>
              <option value="pastdue">Past Due</option>
              <option value="inactive7">Inactive (7+ days)</option>
              <option value="overlimit">Over Plan Limits</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Sort by:</span>
            <select
              data-testid="tenants-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="name">Name (A-Z)</option>
              <option value="gmv">30d GMV (Highest)</option>
              <option value="lastActive">Recently Active</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Tenants Table ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-5 py-3.5">Business</th>
                <th className="px-4 py-3.5">Plan & Status</th>
                <th className="px-4 py-3.5">Last Active</th>
                <th className="px-4 py-3.5">30d Volume</th>
                <th className="px-4 py-3.5 text-center">Users</th>
                <th className="px-4 py-3.5 text-center">Products</th>
                <th className="px-4 py-3.5 text-center">Health</th>
                <th className="px-4 py-3.5">Plan Fit</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    No tenants match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const healthScore = t.health?.score ?? 50;
                  const healthColor =
                    healthScore >= 70
                      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                      : healthScore >= 40
                        ? "text-amber-600 bg-amber-50 border-amber-200"
                        : "text-rose-600 bg-rose-50 border-rose-200";

                  return (
                    <tr
                      key={t.businessId}
                      data-testid="tenant-row"
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <Link
                              href={`/tenants/${t.businessId}`}
                              data-testid="tenant-open"
                              className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                            >
                              {t.name}
                            </Link>
                            <div className="text-xs text-slate-500 font-mono">
                              {t.trialDaysLeft !== null ? (
                                <span className="text-blue-600">
                                  {t.trialDaysLeft} days trial left
                                </span>
                              ) : (
                                <span>{t.branches} branch{t.branches !== 1 ? "es" : ""}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800 text-xs">{t.plan}</span>
                          <span
                            data-testid="tenant-row-status"
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              STATUS_BADGES[t.status] || STATUS_BADGES.ACTIVE
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatRelativeTime(t.lastActiveAt)}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-slate-900">
                          {formatGmv(t.gmv30)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.orders30.toLocaleString()} orders
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-medium text-slate-700">
                          {t.activeUsers} / {t.maxUsers ?? "∞"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-medium text-slate-700">
                          {t.products} / {t.maxProducts ?? "∞"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div
                          data-testid="tenant-health-score"
                          title={t.health?.reason || "Health score based on activity"}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${healthColor}`}
                        >
                          {healthScore}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {t.planFit && PLAN_FIT_BADGES[t.planFit] ? (
                          <span
                            data-testid="tenant-plan-fit"
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${PLAN_FIT_BADGES[t.planFit].class}`}
                          >
                            {PLAN_FIT_BADGES[t.planFit].label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setBranchModalFor(t)}
                            data-testid="tenant-add-branch"
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                            title="Add branch to tenant"
                          >
                            <GitBranch className="w-3 h-3" />
                            Branch
                          </button>

                          <button
                            type="button"
                            onClick={() => handleViewAs(t.businessId)}
                            disabled={viewAsLoadingId === t.businessId}
                            data-testid="tenant-view-as"
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-50"
                            title="Open client app in read-only view-as session"
                          >
                            {viewAsLoadingId === t.businessId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ExternalLink className="w-3 h-3" />
                            )}
                            View As
                          </button>

                          <Link
                            href={`/tenants/${t.businessId}`}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            Details →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Provision Tenant Modal ────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Provision New Tenant</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 rounded-lg p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Business / Shop Name *
                </label>
                <input
                  type="text"
                  required
                  data-testid="tenant-onboard-name"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Al-Madina Autos"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner Email *
                </label>
                <input
                  type="email"
                  required
                  data-testid="tenant-onboard-email"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="ali@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner Initial Password *
                </label>
                <input
                  type="password"
                  required
                  data-testid="tenant-onboard-password"
                  value={formData.ownerPassword}
                  onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="03001234567"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Shop Address (Optional)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Main Market, Shop #12"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  data-testid="tenant-onboard-submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {submitLoading && <Loader2 size={16} className="animate-spin" />}
                  Provision Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Provision Branch Modal ────────────────────────────────────────── */}
      {branchModalFor && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                Add Branch to {branchModalFor.name}
              </h3>
              <button
                onClick={() => setBranchModalFor(null)}
                className="text-slate-400 hover:text-slate-500 rounded-lg p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddBranch} className="p-6 space-y-4">
              {branchError && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm">
                  {branchError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  data-testid="tenant-branch-name"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. WareHouse 2"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Branch Location / Address
                </label>
                <input
                  type="text"
                  value={branchLocation}
                  onChange={(e) => setBranchLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Sector I-9"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBranchModalFor(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={branchSubmitLoading}
                  data-testid="tenant-branch-submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {branchSubmitLoading && <Loader2 size={16} className="animate-spin" />}
                  Add Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
