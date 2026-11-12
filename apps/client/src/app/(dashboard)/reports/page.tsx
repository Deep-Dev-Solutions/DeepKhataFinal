"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Download } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

// Import our new components
import ReportsNav from "@/components/reports/ReportsNav";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import FinancialOverviewTab from "@/components/reports/FinancialOverviewTab";
import InventoryInsightsTab from "@/components/reports/InventoryInsightsTab";
import StaffPerformanceTab from "@/components/reports/StaffPerformanceTab";
import CustomerInsightsTab from "@/components/reports/CustomerInsightsTab";

const dateRangeToDays: Record<string, number> = {
  today: 1,
  "last-7-days": 7,
  "this-month": 30,
  "last-month": 60,
  ytd: 365,
};

export default function ReportsPage() {
  const router = useRouter();
  const { isLoading, hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("last-7-days");
  const daysValue = dateRangeToDays[dateRange] ?? 7;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        Loading reports...
      </div>
    );
  }

  if (!hasPermission("read:reports")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <p className="text-lg font-semibold text-slate-700">
          403 Forbidden: You do not have access to Analytics.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-4 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Reports"
        subtitle="Revenue, profit, stock and staff — the same numbers the shop runs on."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                data-testid="reports-range"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="appearance-none pl-9 pr-8 py-2 bg-white border border-border rounded-md text-sm font-medium text-gray-700 focus:ring-2 focus:ring-brand-500/30 outline-none cursor-pointer h-[var(--control-md)]"
              >
                <option value="today">Today</option>
                <option value="last-7-days">Last 7 Days</option>
                <option value="this-month">This Month</option>
                <option value="ytd">Year to Date</option>
              </select>
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <Button variant="secondary" size="md" data-testid="reports-export">
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        }
      />

      {/* 🟢 NAVIGATION TABS */}
      <ReportsNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* 🟢 DYNAMIC CONTENT */}
      <div className="w-full">
        {activeTab === "overview" && <FinancialOverviewTab days={daysValue} />}
        {activeTab === "inventory" && <InventoryInsightsTab />}
        {activeTab === "staff" && <StaffPerformanceTab />}
        {activeTab === "customers" && <CustomerInsightsTab />}
      </div>
    </div>
  );
}
