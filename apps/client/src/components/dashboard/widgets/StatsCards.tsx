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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
      {/* 1. Daily Gross Sales */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Daily Gross Sales
            </p>
            <h3 className="text-2xl font-black text-slate-900 truncate">
              Rs. {dailyGrossSales.toLocaleString()}
            </h3>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center text-xs font-semibold">
          {hasGrowth ? (
            <span className="text-emerald-600 flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />+{revenueGrowth}%
            </span>
          ) : (
            <span className="text-rose-600 flex items-center">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {revenueGrowth}%
            </span>
          )}
          <span className="text-slate-400 ml-1.5 font-normal">
            vs yesterday
          </span>
        </div>
      </div>

      {/* 2. Customer Udhar (Receivables) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Customer Udhar
            </p>
            <h3 className="text-2xl font-black text-rose-600 truncate">
              Rs. {pendingUdhar.toLocaleString()}
            </h3>
          </div>
          <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center text-xs text-slate-500">
          <span>Across {pendingOrderCount} unsettled orders</span>
        </div>
      </div>

      {/* 3. Net Profit (Owner Business Intelligence) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Today's Net Profit
            </p>
            {isStaff || netProfit === null ? (
              <div className="flex items-center gap-1.5 text-slate-400 py-1">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold">Owner Access Only</span>
              </div>
            ) : (
              <h3
                className={`text-2xl font-black truncate ${
                  netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                Rs. {netProfit.toLocaleString()}
              </h3>
            )}
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
          {isStaff || netProfit === null ? (
            <span className="text-slate-400">Locked for Staff</span>
          ) : (
            <>
              <span className="truncate">
                COGS: Rs.{dailyCOGS.toLocaleString()} | Exp: Rs.
                {dailyExpenses.toLocaleString()}
              </span>
              <span className="font-bold text-slate-700 shrink-0 ml-1">
                {profitMargin}% margin
              </span>
            </>
          )}
        </div>
      </div>

      {/* 4. Active Orders */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Active Orders
            </p>
            <h3 className="text-2xl font-black text-slate-900 truncate">
              {activeOrders}
            </h3>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center text-xs text-slate-500">
          <span>{pendingOrderCount} waiting for full settlement</span>
        </div>
      </div>
    </div>
  );
}
