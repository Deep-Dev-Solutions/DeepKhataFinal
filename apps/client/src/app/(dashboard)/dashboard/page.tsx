"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import StatsCards from "@/components/dashboard/widgets/StatsCards";
import RevenueChart from "@/components/dashboard/widgets/RevenueChart";
import PaymentHealth from "@/components/dashboard/widgets/PaymentHealth";
import RecentOrdersTable from "@/components/dashboard/widgets/RecentOrdersTable";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";
import DuesTodayWidget from "@/components/dashboard/widgets/DuesTodayWidget";
import TransfersInboxWidget from "@/components/dashboard/widgets/TransfersInboxWidget";
import { useDashboard } from "@/hooks/queries/useDashboard";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

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
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-body font-medium text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-danger/30 bg-danger-bg text-body font-medium text-danger-fg">
        {error}
      </div>
    );
  }

  return (
    <div data-testid="dashboard-root" className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Dashboard Overview"
        subtitle="Here's what's happening with your business today."
        actions={
          <Link
            href="/orders/new"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            <Plus className="h-4 w-4" />
            New Order
          </Link>
        }
      />

      <GettingStartedChecklist />

      <StatsCards kpis={dashboardData?.kpis} />

      <DuesTodayWidget />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
