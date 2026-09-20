import Link from "next/link";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

type RecentOrdersTableProps = {
  orders?: Array<{
    orderNumber?: number;
    customerName?: string;
    totalAmount?: number;
    paymentStatus?: string;
    relativeTime?: string;
  }>;
};

export default function RecentOrdersTable({ orders = [] }: RecentOrdersTableProps) {
  const paymentBadgeClass: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700",
    PARTIAL: "bg-yellow-50 text-yellow-700",
    UNPAID: "bg-rose-50 text-rose-700 border border-rose-200",
    PENDING: "bg-slate-100 text-slate-700",
  };

  const paymentIcon: Record<string, any> = {
    PAID: CheckCircle2,
    PARTIAL: Clock,
    UNPAID: AlertCircle,
    PENDING: Clock,
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
        <Link href="/orders" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
          View All Orders
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-6 py-4 font-medium">Order ID</th>
              <th className="px-6 py-4 font-medium">Customer</th>
              <th className="px-6 py-4 font-medium">Amount</th>
              <th className="px-6 py-4 font-medium">Payment Status</th>
              <th className="px-6 py-4 font-medium text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                  No recent orders yet.
                </td>
              </tr>
            ) : (
              orders.map((order, index) => {
                const Icon = paymentIcon[order.paymentStatus || "PENDING"] || Clock;
                const badgeClass = paymentBadgeClass[order.paymentStatus || "PENDING"] || "bg-slate-100 text-slate-700";

                return (
                  <tr key={`${order.orderNumber || index}`} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                    <td className="px-6 py-4 font-semibold text-blue-600 group-hover:underline">#ORD-{order.orderNumber || index + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{order.customerName || "Walk-in Customer"}</td>
                    <td className="px-6 py-4 font-medium">Rs. {Number(order.totalAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md text-[11px] font-bold ${badgeClass}`}>
                        <Icon className="w-3.5 h-3.5" /> {order.paymentStatus || "PENDING"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-right">{order.relativeTime || "Recently"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
