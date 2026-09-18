"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { API_BASE_URL } from "@/lib/auth";

type FinancialOverviewTabProps = {
  days: number;
};

export default function FinancialOverviewTab({
  days,
}: FinancialOverviewTabProps) {
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchFinancialReport = async () => {
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/reports/financial?days=${days}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
            },
          },
        );

        const json = await res.json();
        if (!res.ok || !json?.success)
          throw new Error(json?.message || "Failed to load financial report");

        if (isActive) setReportData(json);
      } catch {
        if (isActive) setError("Could not load financial overview.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchFinancialReport();

    return () => {
      isActive = false;
    };
  }, [days]);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading financial
        overview...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-600 shadow-sm">
        {error}
      </div>
    );
  }

  const kpis = reportData?.kpis || {};
  const revenueData = reportData?.revenueTrend || [];
  const paymentData = reportData?.paymentFlow || [];

  const kpiCards = [
    {
      title: "Total Revenue",
      value: kpis.totalRevenue ?? 0,
      trend: "+0.0%",
      isUp: true,
    },
    {
      title: "Net Profit",
      value: kpis.netProfit ?? 0,
      trend: "+0.0%",
      isUp: true,
      color: "text-blue-600",
    },
    {
      title: "Average Order Value",
      value: kpis.averageOrderValue ?? 0,
      trend: "+0.0%",
      isUp: true,
    },
    {
      title: "Pending Dues (Risk)",
      value: kpis.pendingDues ?? 0,
      trend: "+0.0%",
      isUp: false,
      color: "text-rose-600",
    },
  ];

  const paymentColors = ["#10b981", "#3b82f6", "#f43f5e", "#f59e0b"];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, idx) => (
          <div
            key={idx}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500 mb-1">
              {kpi.title}
            </p>
            <h3
              className={`text-2xl font-bold ${kpi.color || "text-slate-900"}`}
            >
              Rs. {Number(kpi.value || 0).toLocaleString()}
            </h3>
            <div
              className={`mt-2 flex items-center text-xs font-bold w-fit px-2 py-1 rounded-md ${kpi.isUp ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"}`}
            >
              {kpi.isUp ? (
                <ArrowUpRight className="w-3 h-3 mr-1" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-1" />
              )}
              {kpi.trend} vs last week
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Area Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              Revenue vs. Profit Trend
            </h2>
            <p className="text-sm text-slate-500">
              Gross sales vs Net margins.
            </p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(val) => `Rs.${val / 1000}k`}
                />
                <Tooltip
                  formatter={(value: any) =>
                    `Rs. ${Number(value || 0).toLocaleString()}`
                  }
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area
                  type="monotone"
                  name="Gross Revenue"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fill="url(#colorRevenue)"
                />
                <Area
                  type="monotone"
                  name="Net Profit"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#colorProfit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Donut */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="mb-2">
            <h2 className="text-lg font-bold text-slate-900">Payment Flow</h2>
            <p className="text-sm text-slate-500">
              How customers are paying you.
            </p>
          </div>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {paymentData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.color ||
                        paymentColors[index % paymentColors.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) =>
                    `Rs. ${Number(value || 0).toLocaleString()}`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {paymentData.map((item: any, idx: number) => (
              <div
                key={idx}
                className="flex justify-between items-center text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        item.color || paymentColors[idx % paymentColors.length],
                    }}
                  ></div>
                  <span className="text-slate-600 font-medium">
                    {item.name || "Payment Method"}
                  </span>
                </div>
                <span className="font-bold text-slate-900">
                  Rs. {Number(item.value || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
