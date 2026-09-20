"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
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
  BadgeCheck,
} from "lucide-react";

interface BillingLog {
  id: string;
  amount: number;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  status: "ACTIVE" | "READ_ONLY" | "SUSPENDED";
  subscriptionExpiresAt: string | null;
  owner: {
    name: string;
    email: string;
    phone: string | null;
  };
  _count: {
    users: number;
    products: number;
    orders: number;
    branches: number;
  };
  branches: {
    id: string;
    name: string;
    location: string | null;
    createdAt: string;
  }[];
  billingLogs: BillingLog[];
}

const STATUS_META: Record<
  TenantDetail["status"],
  { label: string; badge: string; select: string }
> = {
  ACTIVE: {
    label: "Active",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    select: "bg-emerald-50 text-emerald-700 border-emerald-200",
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

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params?.id;
  const { token } = useAuth();

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
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

  const fetchTenant = useCallback(async () => {
    if (!tenantId || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/agency/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to load tenant");
      }
      const data = await res.json();
      setTenant(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);

  useEffect(() => {
    if (tenantId && token) fetchTenant();
  }, [tenantId, token, fetchTenant]);

  const handleStatusChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const newStatus = e.target.value as TenantDetail["status"];
    if (!tenant || !token || newStatus === tenant.status) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/agency/tenants/${tenant.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update status");
      }
      setTenant({ ...tenant, status: newStatus });
    } catch (err: any) {
      setError(err.message);
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
      const res = await fetch(
        `${API_BASE_URL}/agency/tenants/${tenant.id}/billing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: parseFloat(amount),
            paymentDate,
            notes: notes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to log payment");
      }
      const data = await res.json();
      setAmount("");
      setNotes("");
      setBillingSuccess(
        `Payment of Rs. ${formatAmount(data.billingLog.amount)} logged. Subscription extended to ${formatDate(data.subscriptionExpiresAt)}.`,
      );
      // Refresh tenant state to show new expiry + billing history
      const tenantRes = await fetch(
        `${API_BASE_URL}/agency/tenants/${tenant.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (tenantRes.ok) {
        const fresh = await tenantRes.json();
        setTenant(fresh);
      } else {
        setTenant({ ...tenant, status: data.status, subscriptionExpiresAt: data.subscriptionExpiresAt });
      }
    } catch (err: any) {
      setBillingError(err.message);
    } finally {
      setBillingSubmitting(false);
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
          href="/agency-admin"
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

  const statusMeta = STATUS_META[tenant.status];
  const kpis = [
    { label: "Branches", value: tenant._count.branches, icon: GitBranch, tint: "bg-indigo-50 text-indigo-600" },
    { label: "Users", value: tenant._count.users, icon: Users, tint: "bg-blue-50 text-blue-600" },
    { label: "Master Products", value: tenant._count.products, icon: ShoppingBag, tint: "bg-violet-50 text-violet-600" },
    { label: "Lifetime Orders", value: tenant._count.orders, icon: Receipt, tint: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Back / Page Header ───────────────────────────────────────────── */}
      <div>
        <Link
          href="/agency-admin"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-2"
        >
          <ArrowLeft size={16} />
          Back to Tenants
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
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
                /{tenant.slug} · Owner: {tenant.owner.name} ({tenant.owner.email})
              </p>
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Access Control Card ────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Access Control</h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              Forcefully override this tenant's access state.{" "}
              <span className="font-semibold text-slate-700">Suspended</span>{" "}
              blocks all logins,{" "}
              <span className="font-semibold text-slate-700">Read-Only</span>{" "}
              blocks new sales and edits, and{" "}
              <span className="font-semibold text-slate-700">Active</span>{" "}
              restores full access.
            </p>
            <div className="flex items-center gap-3">
              <select
                value={tenant.status}
                onChange={handleStatusChange}
                disabled={statusUpdating}
                className={`flex-1 px-3 py-2.5 border rounded-lg font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer disabled:opacity-60 ${statusMeta.select}`}
              >
                <option value="ACTIVE" className="bg-white text-slate-900">
                  Active
                </option>
                <option value="READ_ONLY" className="bg-white text-slate-900">
                  Read-Only (Paused)
                </option>
                <option value="SUSPENDED" className="bg-white text-slate-900">
                  Suspended (Soft Delete)
                </option>
              </select>
              {statusUpdating && (
                <Loader2 size={18} className="animate-spin text-slate-400" />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <BadgeCheck size={14} className="text-emerald-500" />
              Current status:{" "}
              <span className="font-semibold text-slate-800">
                {statusMeta.label}
              </span>
              . Changes apply immediately to all users of this business.
            </div>
          </div>
        </div>

        {/* ── Billing & Renewal Card ─────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <CreditCard size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Billing &amp; Renewal</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
              <CalendarClock size={18} className="text-indigo-600 shrink-0" />
              <div className="text-sm">
                <span className="text-slate-500">Subscription expires on </span>
                <span className="font-bold text-slate-900">
                  {formatDate(tenant.subscriptionExpiresAt)}
                </span>
              </div>
            </div>

            <form onSubmit={handleLogPayment} className="space-y-4">
              {billingError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-sm font-medium border border-rose-100">
                  {billingError}
                </div>
              )}
              {billingSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium border border-emerald-100">
                  {billingSuccess}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Amount Received (PKR)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="e.g. 15000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    New Expiration Date
                  </label>
                  <input
                    required
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. 4-month renewal via bank transfer"
                />
              </div>
              <button
                type="submit"
                disabled={billingSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-sm"
              >
                {billingSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Wallet size={16} />
                )}
                {billingSubmitting
                  ? "Logging payment..."
                  : "Log Payment & Extend Subscription"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Billing History ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-indigo-600" />
            <h3 className="font-bold text-slate-900">Payment &amp; Billing History</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {tenant.billingLogs.length} record
            {tenant.billingLogs.length === 1 ? "" : "s"}
          </span>
        </div>
        {tenant.billingLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No payments recorded yet for this tenant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-6 py-3">Payment Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Notes</th>
                  <th className="px-6 py-3">Recorded At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenant.billingLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {formatDate(log.paymentDate)}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold text-xs">
                        Rs. {formatAmount(log.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {log.notes || "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAmount(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}