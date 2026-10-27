"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PaymentHealthProps = {
  paymentHealth?: Array<{ name?: string; value?: number; color?: string }>;
};

const SUCCESS = "var(--color-success)";
const DANGER = "var(--color-danger)";

/** Green for money actually collected, red for what is still owed. */
function tokenColor(name?: string, fallback?: string) {
  const label = (name || "").toLowerCase();
  if (label.includes("paid")) return SUCCESS;
  if (label.includes("pending") || label.includes("udhaar") || label.includes("udhar"))
    return DANGER;
  return fallback && fallback.startsWith("#") ? fallback : SUCCESS;
}

export default function PaymentHealth({ paymentHealth = [] }: PaymentHealthProps) {
  const data = paymentHealth.length
    ? paymentHealth
    : [
        { name: "Paid", value: 0, color: SUCCESS },
        { name: "Pending/Udhaar", value: 0, color: DANGER },
      ];
  const totalVolume = data.reduce(
    (sum, item) => sum + Number(item.value || 0),
    0,
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 pb-1">
        <span className="rounded-md bg-gray-100 p-1.5 text-gray-600">
          <Wallet className="h-4 w-4" />
        </span>
        <div>
          <CardTitle>Payment Health</CardTitle>
          <p className="text-caption text-gray-500">
            Distribution of your receivables
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pt-2">
        <div className="relative min-h-[200px] w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={78}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={tokenColor(entry.name, entry.color)}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) =>
                  `Rs. ${Number(value ?? 0).toLocaleString()}`
                }
                contentStyle={{
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-md)",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-caption font-medium text-gray-400">
              Total Volume
            </span>
            <span className="text-subtitle font-semibold text-gray-900">
              Rs. {totalVolume.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {data.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-body"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tokenColor(item.name, item.color) }}
                />
                <span className="truncate font-medium text-gray-600">
                  {item.name || "Payment"}
                </span>
              </div>
              <span className="shrink-0 font-semibold text-gray-900">
                Rs. {Number(item.value || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
