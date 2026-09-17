"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Warehouse,
  ArrowRightLeft,
  Calendar,
  Layers,
  MapPin,
  Truck,
  Box,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

type Movement = {
  id: string;
  productId: string;
  cabinetId: string | null;
  fromCondition: string | null;
  toCondition: string | null;
  quantity: number;
  direction: "IN" | "OUT" | "TRANSFER" | "CONDITION_UPDATE";
  referenceType: string;
  referenceId: string;
  notes: string | null;
  createdAt: string;
  product: { name: string; sku: string | null };
  cabinet: { name: string; location: string | null } | null;
  user: { name: string };
  vendor: { businessName: string } | null;
};

export default function InventoryLedgerPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/movements?limit=100`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setMovements(data.movements);
      } else {
        setErrorMsg("Failed to load inventory movements.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error fetching movements.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] animate-in fade-in duration-500 mt-2 font-sans">
      <div className="flex items-center gap-3 pb-5 border-b border-slate-200 mb-6 shrink-0">
        <Link
          href="/products"
          className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
            Inventory Movement Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Double-entry log of all stock inbound, outbound, and condition
            changes.
          </p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border-b border-rose-200 text-sm font-semibold text-rose-700 shrink-0">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold">Movement</th>
                <th className="px-6 py-4 font-semibold">Location</th>
                <th className="px-6 py-4 font-semibold">Vendor / Source</th>
                <th className="px-6 py-4 font-semibold text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Loading ledger...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No movements found.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">
                          {m.product?.name || "Unknown"}
                        </span>
                        {m.product?.sku && (
                          <span className="text-xs font-mono text-slate-500">
                            {m.product.sku}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.direction === "IN"
                              ? "bg-emerald-100 text-emerald-700"
                              : m.direction === "OUT"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {m.direction} ({m.referenceType})
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {m.fromCondition ? `${m.fromCondition} → ` : ""}
                          {m.toCondition || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                        {m.cabinet
                          ? `${m.cabinet.name} ${m.cabinet.location ? `(${m.cabinet.location})` : ""}`
                          : "Default"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {m.vendor ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded w-fit">
                          <Truck className="w-3.5 h-3.5 text-indigo-600" />
                          {m.vendor.businessName}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-black text-sm ${m.direction === "IN" ? "text-emerald-600" : m.direction === "OUT" ? "text-rose-600" : "text-slate-700"}`}
                      >
                        {m.direction === "IN"
                          ? "+"
                          : m.direction === "OUT"
                            ? "-"
                            : ""}
                        {m.quantity}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
