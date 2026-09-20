"use client";

import { useRouter } from "next/navigation";
import { CheckSquare, Square, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export default function OrderTable({
  orders, selectedOrders, toggleSelection, toggleAll
}: {
  orders: any[], selectedOrders: string[], toggleSelection: (id: string) => void, toggleAll: () => void
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 w-10">
              <button onClick={toggleAll} className="text-slate-400 hover:text-blue-600">
                {selectedOrders.length === orders.length && orders.length > 0 ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">Order ID</th>
            <th className="px-4 py-3 font-semibold">Customer</th>
            <th className="px-4 py-3 font-semibold">Total</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr
              key={order.id}
              className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedOrders.includes(order.id) ? "bg-blue-50/50" : ""} ${order.status === 'CANCELLED' ? 'opacity-60 bg-slate-50' : ''}`}
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              {/* Checkbox */}
              <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => toggleSelection(order.id)} className="text-slate-400 hover:text-blue-600">
                  {selectedOrders.includes(order.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
              </td>

              {/* 🟢 Beautiful Order Number (e.g., ORD-1044) */}
              <td className="px-4 py-4 font-semibold text-blue-600 hover:underline">
                {order.orderNumber}
              </td>

              {/* Customer Details */}
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <span className={`font-bold ${order.status === 'CANCELLED' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                    {order.customer}
                  </span>
                  <span className="text-xs text-slate-500 font-medium mt-0.5">{order.date}</span>
                </div>
              </td>

              {/* Total Amount */}
              <td className="px-4 py-4 font-medium text-slate-700">
                Rs. {(order.total || 0).toLocaleString()}
              </td>

              {/* 🟢 Static Status Badge (Safe from accidental clicks) */}
              <td className="px-4 py-4">
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                  order.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  order.status === 'PENDING' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-slate-100 text-slate-500 border-slate-200' // CANCELLED
                }`}>
                  {order.status}
                </span>
              </td>

              {/* Payment Status Badge */}
              <td className="px-4 py-4">
                {order.paymentStatus === "PAID" && (
                  <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> PAID
                  </span>
                )}
                {order.paymentStatus === "PARTIAL" && (
                  <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <Clock className="w-3 h-3" /> PARTIAL
                  </span>
                )}
                {order.paymentStatus === "UNPAID" && (
                  <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertCircle className="w-3 h-3" /> UNPAID
                  </span>
                )}
              </td>
              
            </tr>
          ))}

          {/* Empty State Fallback (Just in case) */}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                No orders found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}