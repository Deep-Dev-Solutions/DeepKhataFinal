"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RevenueChartProps = {
  chartData?: Array<{ name?: string; revenue?: number }>;
};

const BRAND = "#1d4ed8"; // var(--color-brand-700)
const GRID = "var(--color-gray-100)";
const TICK = { fill: "var(--color-gray-500)", fontSize: 12 };

export default function RevenueChart({ chartData = [] }: RevenueChartProps) {
  const data = chartData.length ? chartData : [{ name: "No data", revenue: 0 }];

  const total7DayRevenue = data.reduce(
    (sum, item) => sum + Number(item.revenue || 0),
    0,
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle>Revenue Overview</CardTitle>
          <p className="text-caption text-gray-500">Last 7 days performance</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-caption font-semibold text-brand-700">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>7-Day Vol: Rs. {total7DayRevenue.toLocaleString()}</span>
        </div>
      </CardHeader>

      <CardContent className="min-h-[250px] flex-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND} stopOpacity={0.25} />
                <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={TICK}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={TICK}
              width={44}
              tickFormatter={(value) =>
                Number(value) >= 1000
                  ? `${Math.round(Number(value) / 1000)}k`
                  : `${Number(value)}`
              }
            />
            <Tooltip
              contentStyle={{
                borderRadius: "6px",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-md)",
                fontSize: 12,
              }}
              formatter={(value) =>
                value !== undefined
                  ? `Rs. ${Number(value || 0).toLocaleString()}`
                  : ""
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={BRAND}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
