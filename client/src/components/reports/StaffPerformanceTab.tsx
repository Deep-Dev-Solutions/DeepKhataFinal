"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

export default function StaffPerformanceTab() {
  const [staffPerformance, setStaffPerformance] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchStaffPerformance = async () => {
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE_URL}/reports/staff`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        });

        const json = await res.json();
        if (!res.ok || !json?.success)
          throw new Error(json?.message || "Failed to load staff report");

        if (isActive) setStaffPerformance(json.staffPerformance || []);
      } catch {
        if (isActive) setError("Could not load staff performance.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchStaffPerformance();

    return () => {
      isActive = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading staff
        performance...
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            Staff Contribution
          </h2>
          <p className="text-sm text-slate-500">
            Track which team members process the most orders.
          </p>
        </div>
        <div className="h-[300px] w-full mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={staffPerformance}
              margin={{ top: 20, right: 0, left: -20, bottom: 5 }}
              barSize={50}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                dy={10}
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(val) => `${val / 1000}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend verticalAlign="top" height={36} />
              <Bar
                yAxisId="left"
                name="Revenue Generated"
                dataKey="revenue"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="right"
                name="Orders Processed"
                dataKey="orders"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
