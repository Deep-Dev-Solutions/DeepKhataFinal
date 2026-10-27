import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type StatsCardsProps = {
  kpis?: {
    todayRevenue?: number;
    dailyGrossSales?: number;
    pendingPayments?: number;
    pendingUdhar?: number;
    dailyCOGS?: number | null;
    dailyExpenses?: number | null;
    netProfit?: number | null;
    profitMargin?: number | null;
    revenueGrowth?: number;
    activeOrders?: number;
    pendingOrderCount?: number;
    isStaff?: boolean;
  };
};

export default function StatsCards({ kpis }: StatsCardsProps) {
  const dailyGrossSales = Number(
    kpis?.dailyGrossSales ?? kpis?.todayRevenue ?? 0,
  );
  const pendingUdhar = Number(kpis?.pendingUdhar ?? kpis?.pendingPayments ?? 0);
  const activeOrders = Number(kpis?.activeOrders || 0);
  const pendingOrderCount = Number(kpis?.pendingOrderCount || 0);
  const revenueGrowth = Number(kpis?.revenueGrowth ?? 0);
  const hasGrowth = revenueGrowth >= 0;

  const isStaff = Boolean(kpis?.isStaff);
  const netProfit =
    kpis?.netProfit !== null && kpis?.netProfit !== undefined
      ? Number(kpis.netProfit)
      : null;
  const profitMargin =
    kpis?.profitMargin !== null && kpis?.profitMargin !== undefined
      ? Number(kpis.profitMargin)
      : null;
  const dailyCOGS = Number(kpis?.dailyCOGS || 0);
  const dailyExpenses = Number(kpis?.dailyExpenses || 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Daily Gross Sales */}
      <Card>
        <CardContent className="flex flex-col justify-between px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-caption font-medium uppercase tracking-wide text-gray-500">
                Daily Gross Sales
              </p>
              <p className="truncate text-title font-semibold text-gray-900">
                Rs. {dailyGrossSales.toLocaleString()}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-brand-50 p-1.5 text-brand-700">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center text-caption font-medium">
            {hasGrowth ? (
              <span className="flex items-center text-success">
                <ArrowUpRight className="mr-0.5 h-3 w-3" />+{revenueGrowth}%
              </span>
            ) : (
              <span className="flex items-center text-danger">
                <ArrowDownRight className="mr-0.5 h-3 w-3" />
                {revenueGrowth}%
              </span>
            )}
            <span className="ml-1.5 font-normal text-gray-400">
              vs yesterday
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 2. Customer Udhar (Receivables) */}
      <Card>
        <CardContent className="flex flex-col justify-between px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-caption font-medium uppercase tracking-wide text-gray-500">
                Customer Udhar
              </p>
              <p
                className={`truncate text-title font-semibold ${pendingUdhar > 0 ? "text-danger" : "text-gray-900"}`}
              >
                Rs. {pendingUdhar.toLocaleString()}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-md p-1.5 ${pendingUdhar > 0 ? "bg-danger-bg text-danger" : "bg-gray-100 text-gray-500"}`}
            >
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center text-caption text-gray-500">
            <span>Across {pendingOrderCount} unsettled orders</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Net Profit (Owner Business Intelligence) */}
      <Card>
        <CardContent className="flex flex-col justify-between px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-caption font-medium uppercase tracking-wide text-gray-500">
                Today&apos;s Net Profit
              </p>
              {isStaff || netProfit === null ? (
                <div className="flex items-center gap-1.5 py-0.5 text-gray-400">
                  <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                  <span className="text-caption font-semibold">
                    Owner Access Only
                  </span>
                </div>
              ) : (
                <p
                  className={`truncate text-title font-semibold ${
                    netProfit > 0
                      ? "text-success"
                      : netProfit < 0
                        ? "text-danger"
                        : "text-gray-900"
                  }`}
                >
                  Rs. {netProfit.toLocaleString()}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-md p-1.5 ${
                isStaff || netProfit === null
                  ? "bg-gray-100 text-gray-500"
                  : netProfit >= 0
                    ? "bg-success-bg text-success"
                    : "bg-danger-bg text-danger"
              }`}
            >
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-caption text-gray-500">
            {isStaff || netProfit === null ? (
              <span className="text-gray-400">Locked for Staff</span>
            ) : (
              <>
                <span className="truncate">
                  COGS: Rs.{dailyCOGS.toLocaleString()} · Exp: Rs.
                  {dailyExpenses.toLocaleString()}
                </span>
                <span className="ml-1 shrink-0 font-semibold text-gray-700">
                  {profitMargin}%
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Active Orders */}
      <Card>
        <CardContent className="flex flex-col justify-between px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-caption font-medium uppercase tracking-wide text-gray-500">
                Active Orders
              </p>
              <p className="truncate text-title font-semibold text-gray-900">
                {activeOrders}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-500">
              <ShoppingCart className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center text-caption text-gray-500">
            <span>{pendingOrderCount} waiting for full settlement</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
