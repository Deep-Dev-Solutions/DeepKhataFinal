"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import StatsCards from "@/components/dashboard/widgets/StatsCards";
import RevenueChart from "@/components/dashboard/widgets/RevenueChart";
import PaymentHealth from "@/components/dashboard/widgets/PaymentHealth";
import RecentOrdersTable from "@/components/dashboard/widgets/RecentOrdersTable";
import DuesTodayWidget from "@/components/dashboard/widgets/DuesTodayWidget";
import TransfersInboxWidget from "@/components/dashboard/widgets/TransfersInboxWidget";
import { useDashboard } from "@/hooks/queries/useDashboard";

export default function DashboardHomePage() {
  const { data: dashboardData, isPending: isLoading, error: queryError } =
    useDashboard();
  const error = queryError
    ? queryError.message || "Could not load dashboard data."
    : "";

  useEffect(() => {
    if (isLoading || error) return;
    if (new URLSearchParams(window.location.search).get("panel") !== "transfers")
      return;
    document
      .querySelector('[data-testid="transfers-widget"]')
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLoading, error]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-sm font-medium text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-600">
        {error}
      </div>
    );
  }

  return (
    <div data-testid="dashboard-root" className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dashboard Overview
          </h1>
          <p className="text-sm text-slate-500">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/orders/new"
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="w-4 h-4" />
            New Order
          </Link>
        </div>
      </div>

      <StatsCards kpis={dashboardData?.kpis} />

      <DuesTodayWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <RevenueChart chartData={dashboardData?.chartData || []} />
        </div>

        <div className="lg:col-span-1">
          <PaymentHealth paymentHealth={dashboardData?.paymentHealth || []} />
        </div>
      </div>

      <TransfersInboxWidget />

      <RecentOrdersTable orders={dashboardData?.recentOrders || []} />
    </div>
  );
}
