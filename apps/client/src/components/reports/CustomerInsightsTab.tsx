"use client";

import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

export default function CustomerInsightsTab() {
  const [vipCustomers, setVipCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchCustomerInsights = async () => {
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE_URL}/reports/customers`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        });

        const json = await res.json();
        if (!res.ok || !json?.success)
          throw new Error(json?.message || "Failed to load customer report");

        if (isActive) setVipCustomers(json.vipCustomers || []);
      } catch {
        if (isActive) setError("Could not load customer insights.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchCustomerInsights();

    return () => {
      isActive = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading customer
        insights...
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-amber-50/30">
          <h2 className="text-lg font-bold text-amber-700 flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-500 text-amber-500" /> VIP
            Customers (Highest LTV)
          </h2>
          <p className="text-sm text-slate-500">
            Your most valuable customers based on lifetime spend.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Customer Name</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Total Orders</th>
                <th className="px-6 py-4 font-medium">Lifetime Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vipCustomers.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {c.name || "Customer"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                      {c.type || "Retail"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{c.orders ?? 0}</td>
                  <td className="px-6 py-4 font-bold text-emerald-600">
                    Rs. {Number(c.spent || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
