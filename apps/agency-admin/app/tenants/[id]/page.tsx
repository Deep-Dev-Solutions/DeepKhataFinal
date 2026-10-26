"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  Building2,
  Users,
  ShoppingBag,
  Receipt,
  GitBranch,
  CreditCard,
  ShieldCheck,
  CalendarClock,
  ArrowLeft,
  Loader2,
  Wallet,
  ExternalLink,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type {
  TenantDetail,
  LogPaymentResponse,
  SetDealResponse,
  DealHistoryRow,
  TenantAnalyticsDetail,
} from "@/types/agency";

const STATUS_META: Record<
  string,
  { label: string; badge: string; select: string }
> = {
  ACTIVE: {
    label: "Active",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    select: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  TRIALING: {
    label: "Trialing",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    select: "bg-blue-50 text-blue-700 border-blue-200",
  },
  PAST_DUE: {
    label: "Past Due",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    select: "bg-amber-50 text-amber-700 border-amber-200",
  },
  READ_ONLY: {
    label: "Read-Only",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    select: "bg-amber-50 text-amber-700 border-amber-200",
  },
  SUSPENDED: {
    label: "Suspended",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    select: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(value: number | string | undefined | null) {
  if (value === undefined || value === null) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params?.id;
  const { token, isLoading: isAuthLoading } = useAuth();

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [analytics, setAnalytics] = useState<TenantAnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Status override state
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Billing form state
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    addMonths(new Date(), 4).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingSuccess, setBillingSuccess] = useState("");
  const [billingSubmitting, setBillingSubmitting] = useState(false);

  // View-as and PDF loading
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Set-deal form state
  const [dealPlan, setDealPlan] = useState("CUSTOM");
  const [dealPrice, setDealPrice] = useState("");
  const [dealCycle, setDealCycle] = useState("MONTHLY");
  const [dealStart, setDealStart] = useState("");
  const [dealEnd, setDealEnd] = useState("");
  const [dealMaxBranches, setDealMaxBranches] = useState(1);
  const [dealMaxUsers, setDealMaxUsers] = useState(5);
  const [dealMaxProducts, setDealMaxProducts] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [dealError, setDealError] = useState("");
  const [dealSuccess, setDealSuccess] = useState("");
  const [dealHistory, setDealHistory] = useState<DealHistoryRow[]>([]);

  const fetchTenant = useCallback(async () => {
    if (!tenantId || !token) {
      if (!isAuthLoading) setLoading(false);
      return;
    }
    try {
      const [tData, aData] = await Promise.all([
        api.get<TenantDetail>(`/agency/tenants/${tenantId}`),
        api.get<TenantAnalyticsDetail>(`/agency/analytics/tenants/${tenantId}`).catch(() => null),
      ]);
      setTenant(tData);
      setAnalytics(aData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [tenantId, token, isAuthLoading]);

  useEffect(() => {
    const load = async () => {
      if (tenantId && token) {
        await fetchTenant();
        await fetchDealHistory();
      } else if (!isAuthLoading) {
        setLoading(false);
      }
    };
    load().catch(console.error);
  }, [tenantId, token, isAuthLoading, fetchTenant]);

  const handleStatusChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const newStatus = e.target.value as TenantDetail["status"];
    if (!tenant || !token || newStatus === tenant.status) return;
    setStatusUpdating(true);
    try {
      await api.patch(`/agency/tenants/${tenant.id}/status`, {
        status: newStatus,
      });
      setTenant({ ...tenant, status: newStatus });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleLogPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !token) return;
    setBillingSubmitting(true);
    setBillingError("");
    setBillingSuccess("");

    try {
      const data = await api.post<LogPaymentResponse>(
        `/agency/tenants/${tenant.id}/billing`,
        {
          amount: parseFloat(amount),
          paymentDate,
          notes: notes || undefined,
        },
      );
      setAmount("");
      setNotes("");
      setBillingSuccess(
        `Payment of Rs. ${formatAmount(data.billingLog.amount)} logged. Subscription extended to ${formatDate(data.subscriptionExpiresAt)}.`,
      );
      await fetchTenant();
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : "Failed to log payment");
    } finally {
      setBillingSubmitting(false);
    }
  };

  const handleViewAs = async () => {
    if (!tenant) return;
    setViewAsLoading(true);
    try {
      const res = await api.post<{ token: string; url: string; expiresAt: string }>(
        `/agency/tenants/${tenant.id}/view-as`
      );
      if (res?.url) {
        window.open(res.url, "_blank");
      }
    } catch (err) {
      console.error("View as failed:", err);
    } finally {
      setViewAsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!tenant) return;
    setPdfDownloading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${apiUrl}/agency/analytics/tenants/${tenant.id}/usage-statement.pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("PDF download failed");
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `usage-statement-${tenant.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Failed to download PDF:", err);
    } finally {
      setPdfDownloading(false);
    }
  };

  const fetchDealHistory = async () => {
    if (!tenantId || !token) return;
    try {
      const data = await api.get<DealHistoryRow[]>(
        `/agency/tenants/${tenantId}/deal-history`,
      );
      setDealHistory(data || []);
    } catch (err) {
      console.error("Failed to load deal history:", err);
    }
  };

  const handleSetDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !token) return;
    setDealSubmitting(true);
    setDealError("");
    setDealSuccess("");
    try {
      const start = dealStart || new Date().toISOString().slice(0, 10);
      const end = dealEnd || start;
      const data = await api.post<SetDealResponse>(
        `/agency/tenants/${tenant.id}/deal`,
        {
          plan: dealPlan,
          price: dealPrice,
          billingCycle: dealCycle,
          startDate: start,
          endDate: end,
          maxBranches: dealMaxBranches,
          maxUsers: dealMaxUsers,
          maxProducts: dealMaxProducts === "" ? null : Number(dealMaxProducts),
          notes: dealNotes || undefined,
        },
      );
      setDealPrice("");
      setDealNotes("");
      setDealSuccess(
        `Deal set: ${data.subscription.billingCycle} ${data.subscription.priceOverride != null ? "Rs. " + data.subscription.priceOverride.toFixed(2) : ""} · ${data.subscription.currentPeriodStart} → ${data.subscription.currentPeriodEnd}`,
      );
      await fetchTenant();
      await fetchDealHistory();
    } catch (err: unknown) {
      setDealError(err instanceof Error ? err.message : "Failed to set deal");
    } finally {
      setDealSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading tenant workspace...
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="p-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to Tenants
        </Link>
        <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl p-4 text-sm font-medium">
          {error}
        </div>
      </div>
    );
  }

  if (!tenant) return null;

  const statusMeta = STATUS_META[tenant.status] || STATUS_META.ACTIVE;
  const kpis = [
    { label: "Branches", value: tenant._count?.branches ?? 0, icon: GitBranch, tint: "bg-indigo-50 text-indigo-600" },
    { label: "Users", value: tenant._count?.users ?? 0, icon: Users, tint: "bg-blue-50 text-blue-600" },
    { label: "Master Products", value: tenant._count?.products ?? 0, icon: ShoppingBag, tint: "bg-violet-50 text-violet-600" },
    { label: "Lifetime Orders", value: tenant._count?.orders ?? 0, icon: Receipt, tint: "bg-emerald-50 text-emerald-600" },
  ];

  // Calculate 90d chart max for sparkline scaling
  const maxDailyOrders = analytics?.series
    ? Math.max(1, ...analytics.series.map((s) => s.orders))
    : 1;

  return (
    <div data-testid="tenant-detail" className="space-y-6 animate-in fade-in duration-500">
      {/* ── Back / Page Header ───────────────────────────────────────────── */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-2"
        >
          <ArrowLeft size={16} />
          Back to Tenants
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {tenant.name}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusMeta.badge}`}
                >
                  <ShieldCheck size={12} />
                  {statusMeta.label}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5 font-mono">
                /{tenant.slug} · Owner: {tenant.owner?.name} ({tenant.owner?.email})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              data-testid="tenant-usage-pdf"
              className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              {pdfDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Usage Statement PDF
            </button>

            <button
              type="button"
              onClick={handleViewAs}
              disabled={viewAsLoading}
              data-testid="tenant-view-as"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {viewAsLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              View As Tenant
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl p-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* ── KPI Header ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm"
            >
              <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${kpi.tint}`}>
                <Icon size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 leading-none">
                  {kpi.value}
                </div>
                <div className="text-xs font-medium text-slate-500 mt-1">
                  {kpi.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 90-Day Volume Trend Chart ────────────────────────────────────── */}
      {analytics?.series && analytics.series.length > 0 && (
        <div
          data-testid="tenant-daily-chart"
          className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900">90-Day Order Activity Trend</h3>
              <p className="text-xs text-slate-500">Continuous daily orders recorded across all branches</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-700">
                Total: {analytics.series.reduce((acc, s) => acc + s.orders, 0).toLocaleString()} orders
              </span>
            </div>
          </div>

          <div className="h-28 flex items-end gap-[2px] pt-4">
            {analytics.series.map((s) => {
              const heightPct = Math.max(4, Math.round((s.orders / maxDailyOrders) * 100));
              return (
                <div
                  key={s.date}
                  className="flex-1 bg-indigo-100 hover:bg-indigo-600 rounded-t transition-colors relative group"
                  style={{ height: `${heightPct}%` }}
                >
                  <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">
                    {s.date}: {s.orders} orders ({formatAmount(s.gmv)} Rs)
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-2 border-t pt-1">
            <span>90 days ago ({analytics.series[0]?.date})</span>
            <span>Today ({analytics.series[analytics.series.length - 1]?.date})</span>
          </div>
        </div>
      )}

      {/* ── Activity Heatmap & Top Products ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heatmap */}
        {analytics?.heatmap && (
          <div
            data-testid="tenant-activity-heatmap"
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"
          >
            <h3 className="font-bold text-slate-900 mb-1">Hour-of-Day Activity Heatmap</h3>
            <p className="text-xs text-slate-500 mb-4">Peak operating hours (Pakistan Standard Time)</p>
            <div className="space-y-1">
              {analytics.heatmap.map((hours, dow) => {
                const maxInHeatmap = Math.max(1, ...analytics.heatmap.flat());
                return (
                  <div key={DOW_LABELS[dow]} className="flex items-center gap-1.5 text-xs">
                    <span className="w-8 text-[11px] font-medium text-slate-500">
                      {DOW_LABELS[dow]}
                    </span>
                    <div className="flex-1 flex gap-0.5">
                      {hours.map((val, hr) => {
                        const intensity = val === 0 ? 0 : Math.ceil((val / maxInHeatmap) * 4);
                        const bgColors = [
                          "bg-slate-100",
                          "bg-indigo-100",
                          "bg-indigo-300",
                          "bg-indigo-500",
                          "bg-indigo-700",
                        ];
                        return (
                          <div
                            key={hr}
                            title={`${DOW_LABELS[dow]} ${hr}:00 — ${val} orders`}
                            className={`flex-1 h-4 rounded-sm ${bgColors[intensity]} cursor-pointer`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-2 pl-9">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>
        )}

        {/* Top 10 Products */}
        {analytics?.topProducts && (
          <div
            data-testid="tenant-top-products"
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm overflow-hidden"
          >
            <h3 className="font-bold text-slate-900 mb-1">Top Products by Revenue</h3>
            <p className="text-xs text-slate-500 mb-4">Last 90 days completed order items</p>
            {analytics.topProducts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No sales recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="pb-2">Product</th>
                      <th className="pb-2 text-center">Qty Sold</th>
                      <th className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.topProducts.map((p) => (
                      <tr key={p.productId} className="hover:bg-slate-50">
                        <td className="py-2 font-medium text-slate-900 truncate max-w-[180px]">
                          {p.name}
                        </td>
                        <td className="py-2 text-center text-slate-600">{p.qty}</td>
                        <td className="py-2 text-right font-semibold text-slate-900">
                          Rs {formatAmount(p.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Limit Meters & Branch Split ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Limits */}
        {analytics?.limits && analytics?.usage && (
          <div
            data-testid="tenant-limits"
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4"
          >
            <h3 className="font-bold text-slate-900 mb-1">Plan Limit Meters</h3>
            <p className="text-xs text-slate-500">Current resource utilization against subscription quotas</p>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-700">Branches</span>
                  <span className="text-slate-500">
                    {analytics.usage.branches} / {analytics.limits.maxBranches ?? "Unlimited"}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full"
                    style={{
                      width: `${analytics.limits.maxBranches ? Math.min(100, (analytics.usage.branches / analytics.limits.maxBranches) * 100) : 20}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-700">Staff Accounts & Invites</span>
                  <span className="text-slate-500">
                    {analytics.usage.users} / {analytics.limits.maxUsers ?? "Unlimited"}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{
                      width: `${analytics.limits.maxUsers ? Math.min(100, (analytics.usage.users / analytics.limits.maxUsers) * 100) : 20}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-700">Catalog Products</span>
                  <span className="text-slate-500">
                    {analytics.usage.products} / {analytics.limits.maxProducts ?? "Unlimited"}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full"
                    style={{
                      width: `${analytics.limits.maxProducts ? Math.min(100, (analytics.usage.products / analytics.limits.maxProducts) * 100) : 10}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Branch Split */}
        {analytics?.branchSplit && (
          <div
            data-testid="tenant-branch-split"
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm overflow-hidden"
          >
            <h3 className="font-bold text-slate-900 mb-1">Branch Volume Split</h3>
            <p className="text-xs text-slate-500 mb-4">Volume breakdown across store locations</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="pb-2">Branch</th>
                    <th className="pb-2 text-center">Orders</th>
                    <th className="pb-2 text-right">GMV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.branchSplit.map((b) => (
                    <tr key={b.branchId || "main"} className="hover:bg-slate-50">
                      <td className="py-2 font-medium text-slate-900">{b.name}</td>
                      <td className="py-2 text-center text-slate-600">{b.orders}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">
                        Rs {formatAmount(b.gmv)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Team Users & Sessions ────────────────────────────────────────── */}
      {analytics?.users && (
        <div
          data-testid="tenant-users-list"
          className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"
        >
          <h3 className="font-bold text-slate-900 mb-1">Team Members & Activity</h3>
          <p className="text-xs text-slate-500 mb-4">Registered team members and recent sessions</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Last Active</th>
                  <th className="pb-2 text-right">90d Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-semibold text-slate-900">{u.name}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">{formatDate(u.lastActiveAt)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-700">{u.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Access Control & Log Payment (Legacy Preserved) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Access Control Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Access Control</h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              Forcefully override this tenant&apos;s access state.{" "}
              <span className="font-semibold text-slate-700">Suspended</span>{" "}
              blocks all logins,{" "}
              <span className="font-semibold text-slate-700">Read-Only</span>{" "}
              disallows POS operations and writes.
            </p>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700 shrink-0">
                Status:
              </label>
              <select
                data-testid="tenant-status-select"
                value={tenant.status}
                onChange={handleStatusChange}
                disabled={statusUpdating}
                className={`text-sm font-semibold rounded-lg px-3 py-2 border shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${statusMeta.select} disabled:opacity-50`}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="READ_ONLY">READ_ONLY</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
              {statusUpdating && (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-1">
              <div>
                Current Status:{" "}
                <span data-testid="tenant-status" className="font-semibold text-slate-800">
                  {tenant.status}
                </span>
              </div>
              <div>
                Expiry:{" "}
                <span data-testid="tenant-expiry" className="font-semibold text-slate-800">
                  {formatDate(tenant.subscriptionExpiresAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Log Payment Form */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <Wallet size={16} className="text-emerald-600" />
            <h3 className="font-bold text-slate-900">Log Cash / Offline Payment</h3>
          </div>
          <form onSubmit={handleLogPayment} className="p-6 space-y-4">
            {billingError && (
              <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm">
                {billingError}
              </div>
            )}
            {billingSuccess && (
              <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm">
                {billingSuccess}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount (PKR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="tenant-payment-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Next Expiry Date *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Paid in cash via field rep"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={billingSubmitting}
              data-testid="tenant-payment-submit"
              className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              {billingSubmitting && <Loader2 size={16} className="animate-spin" />}
              Log Payment & Extend Subscription
            </button>
          </form>
        </div>
      </div>

      {/* ── Set Custom Deal ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Set Deal Form */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <CreditCard size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Set Custom Deal</h3>
          </div>
          <form onSubmit={handleSetDeal} className="p-6 space-y-4">
            {dealError && (
              <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm">
                {dealError}
              </div>
            )}
            {dealSuccess && (
              <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm">
                {dealSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Template Plan *
                </label>
                <select
                  data-testid="deal-plan"
                  value={dealPlan}
                  onChange={(e) => setDealPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="TRIAL">TRIAL (Free Trial)</option>
                  <option value="BASIC">BASIC</option>
                  <option value="STANDARD">STANDARD</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Price (PKR) *
                </label>
                <input
                  type="text"
                  data-testid="deal-price"
                  value={dealPrice}
                  onChange={(e) => setDealPrice(e.target.value)}
                  placeholder="e.g. 20000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Billing Cycle
              </label>
              <select
                data-testid="deal-cycle"
                value={dealCycle}
                onChange={(e) => setDealCycle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="CUSTOM">Custom (exact dates)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  data-testid="deal-start"
                  required
                  value={dealStart}
                  onChange={(e) => setDealStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  data-testid="deal-end"
                  required
                  value={dealEnd}
                  onChange={(e) => setDealEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Branches
                </label>
                <input
                  type="number"
                  data-testid="deal-maxbranches"
                  value={dealMaxBranches}
                  onChange={(e) => setDealMaxBranches(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Users
                </label>
                <input
                  type="number"
                  data-testid="deal-maxusers"
                  value={dealMaxUsers}
                  onChange={(e) => setDealMaxUsers(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Products
                </label>
                <input
                  type="number"
                  data-testid="deal-maxproducts"
                  value={dealMaxProducts}
                  onChange={(e) => setDealMaxProducts(e.target.value)}
                  placeholder="unlimited"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                data-testid="deal-notes"
                value={dealNotes}
                onChange={(e) => setDealNotes(e.target.value)}
                placeholder="e.g. Annual renewal deal"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={dealSubmitting}
              data-testid="deal-submit"
              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              {dealSubmitting && <Loader2 size={16} className="animate-spin" />}
              Set Deal & Save History
            </button>
          </form>
        </div>

        {/* Deal History Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <CalendarClock size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Deal History</h3>
          </div>
          <div className="overflow-x-auto p-6">
            {dealHistory.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">
                No deal changes recorded yet.
              </p>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-6 py-3">Changed At</th>
                    <th className="px-6 py-3">Plan</th>
                    <th className="px-6 py-3 text-right">Price</th>
                    <th className="px-6 py-3">Period</th>
                    <th className="px-6 py-3">Limits</th>
                    <th className="px-6 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dealHistory.map((row) => {
                    const n = (row.new as Record<string, unknown> | null) ?? {};
                    const limits = (n.customLimits as { maxBranches?: number; maxUsers?: number; maxProducts?: number } | null) ?? {};
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900">
                          {formatDate(row.changedAt as string | null | undefined)}
                        </td>
                        <td className="px-6 py-3 text-slate-600">
                          {(n.plan as string | undefined) || "—"}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-600">
                          {n.priceOverride != null ? `Rs. ${Number(n.priceOverride).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-6 py-3 text-slate-600">
                          {formatDate(n.currentPeriodStart as string | null | undefined)} →{" "}
                          {formatDate(n.currentPeriodEnd as string | null | undefined)}
                        </td>
                        <td className="px-6 py-3 text-slate-600 text-sm">
                          {limits.maxBranches ?? "∞"} br /{" "}
                          {limits.maxUsers ?? "∞"} us /{" "}
                          {limits.maxProducts ?? "∞"} pr
                        </td>
                        <td className="px-6 py-3 text-slate-500">
                          {row.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Billing History Table ────────────────────────────────────────── */}
      {tenant.billingLogs && tenant.billingLogs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
            <h3 className="font-bold text-slate-900">Payment & Billing History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-6 py-3">Payment Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Notes</th>
                  <th className="px-6 py-3">Recorded At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenant.billingLogs.map((log) => (
                  <tr
                    data-testid="tenant-billing-row"
                    key={log.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {formatDate(log.paymentDate)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-emerald-700">
                      Rs. {formatAmount(log.amount)}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {log.notes || "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-400">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
