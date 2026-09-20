"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Calendar, Download } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

// Import our new components
import ReportsNav from "@/components/reports/ReportsNav";
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-20 mt-2">
      {/* 🟢 HEADER & EXPORT ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track your revenue, profit margins, and business growth.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="last-7-days">Last 7 Days</option>
              <option value="this-month">This Month (June)</option>
              <option value="ytd">Year to Date</option>
            </select>
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          </div>

          <button className="flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

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
