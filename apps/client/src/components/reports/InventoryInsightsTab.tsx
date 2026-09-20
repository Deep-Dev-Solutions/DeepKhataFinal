"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

export default function InventoryInsightsTab() {
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [deadStock, setDeadStock] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchInventoryInsights = async () => {
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE_URL}/reports/inventory`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        });

        const json = await res.json();
        if (!res.ok || !json?.success)
          throw new Error(json?.message || "Failed to load inventory report");

        if (isActive) {
          setTopProducts(json.topProducts || []);
          setDeadStock(json.deadStock || []);
        }
      } catch (err: any) {
        if (isActive)
          setError(err?.message || "Could not load inventory insights.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchInventoryInsights();

    return () => {
      isActive = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading inventory
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              Top Performing Products
            </h2>
            <p className="text-sm text-slate-500">
              Items generating the most revenue.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Sold</th>
                  <th className="px-6 py-4 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {p.name || "Product"}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.sold ?? 0}</td>
                    <td className="px-6 py-4 font-bold text-emerald-600">
                      Rs. {Number(p.revenue || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🟢 NEW: Dead Stock / Slow Movers */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/30">
            <div>
              <h2 className="text-lg font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Dead Stock Alerts
              </h2>
              <p className="text-sm text-slate-500">
                Items with 0 sales in the last 30 days.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Stock Stuck</th>
                  <th className="px-6 py-4 font-medium">Capital Tied Up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deadStock.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {p.name || "Product"}
                      </p>
                      <p className="text-xs text-rose-500">
                        {p.daysUnsold ?? 0} days unsold
                      </p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {p.stock ?? 0} units
                    </td>
                    <td className="px-6 py-4 font-bold text-rose-600">
                      Rs. {Number(p.tiedValue || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
