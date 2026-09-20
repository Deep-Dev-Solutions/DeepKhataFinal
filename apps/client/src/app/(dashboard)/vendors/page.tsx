"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Phone,
  ArrowRight,
  Wallet,
  CheckCircle2,
  Search,
  Package,
  Layers,
  ShoppingBag,
  MapPin,
  Clock,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

type VendorRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  address?: string | null;
  balance: number;
  totalPurchased?: number;
  totalPaid?: number;
  totalUnitsSupplied?: number;
  productsCount?: number;
  inStockUnits?: number;
  lastActivityDate?: string | null;
};

function VendorsPageContent() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "payable" | "settled">(
    "all",
  );

  const refreshVendors = useCallback(async () => {
    setIsLoading(true);
    setPageError("");

    try {
      const response = await fetch(`${API_BASE_URL}/vendors`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to load vendors",
        );
      }

      setVendors(data?.vendors || []);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load vendors",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshVendors();
  }, [refreshVendors]);

  const totalPayable = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.balance > 0 ? v.balance : 0), 0),
    [vendors],
  );

  const totalPurchases = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.totalPurchased || 0), 0),
    [vendors],
  );

  const totalPaid = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.totalPaid || 0), 0),
    [vendors],
  );

  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      if (filterMode === "payable" && v.balance <= 0) return false;
      if (filterMode === "settled" && v.balance > 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        v.businessName.toLowerCase().includes(q) ||
        (v.contactName && v.contactName.toLowerCase().includes(q)) ||
        (v.phone && v.phone.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
      );
    });
  }, [vendors, filterMode, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-indigo-600" />
            Vendor Hub
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your suppliers, track accounts payable, and trace inventory
            purchased.
          </p>
        </div>
        <button
          onClick={() => router.push("/vendors/new")}
          className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 w-full sm:w-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Vendor
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Accounts Payable
            </p>
            <p className="text-2xl font-black text-rose-600 mt-1">
              Rs. {isLoading ? "..." : totalPayable.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Outstanding debt owed to vendors
            </p>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lifetime Sourced
            </p>
            <p className="text-2xl font-black text-indigo-900 mt-1">
              Rs. {isLoading ? "..." : totalPurchases.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Total goods value purchased
            </p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Paid Out
            </p>
            <p className="text-2xl font-black text-emerald-700 mt-1">
              Rs. {isLoading ? "..." : totalPaid.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Settled payments made
            </p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Vendors
            </p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? "..." : vendors.length}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Registered suppliers & partners
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-slate-500">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1">
        {pageError && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700 flex items-center justify-between">
            <span>{pageError}</span>
            <button
              onClick={() => setPageError("")}
              className="text-rose-500 hover:text-rose-700 font-bold"
            >
              &times;
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor name, contact person, phone..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                filterMode === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              All ({vendors.length})
            </button>
            <button
              onClick={() => setFilterMode("payable")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                filterMode === "payable"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-white text-rose-600 border border-slate-200 hover:bg-rose-50"
              }`}
            >
              With Payable ({vendors.filter((v) => v.balance > 0).length})
            </button>
            <button
              onClick={() => setFilterMode("settled")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                filterMode === "settled"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-white text-emerald-700 border border-slate-200 hover:bg-emerald-50"
              }`}
            >
              Settled ({vendors.filter((v) => v.balance <= 0).length})
            </button>
          </div>
        </div>

        {/* Vendors Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Vendor & Contact</th>
                <th className="px-6 py-3.5">Items Supplied</th>
                <th className="px-6 py-3.5 text-right">Lifetime Sourced</th>
                <th className="px-6 py-3.5 text-right">Paid Out</th>
                <th className="px-6 py-3.5 text-right">Account Balance</th>
                <th className="px-6 py-3.5">Last Activity</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td
                    className="px-6 py-12 text-slate-500 text-center"
                    colSpan={7}
                  >
                    <span className="animate-pulse font-medium">
                      Loading vendors...
                    </span>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td
                    className="px-6 py-12 text-slate-400 text-center"
                    colSpan={7}
                  >
                    <Building2 className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
                    <p className="font-semibold text-slate-600 text-sm">
                      No vendors match your search
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try clearing filters or add a new vendor.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/vendors/${vendor.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors text-sm">
                          {vendor.businessName}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          {vendor.contactName && (
                            <span className="text-slate-600 text-xs font-medium">
                              {vendor.contactName}
                            </span>
                          )}
                          {vendor.phone && (
                            <span className="text-slate-400 text-xs flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3" />
                              {vendor.phone}
                            </span>
                          )}
                        </div>
                        {vendor.address && (
                          <span className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5 truncate max-w-xs">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {vendor.address}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs">
                          {vendor.totalUnitsSupplied || 0} units
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {vendor.productsCount || 0} distinct products
                        </span>
                        {vendor.inStockUnits !== undefined &&
                          vendor.inStockUnits > 0 && (
                            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              {vendor.inStockUnits} in stock
                            </span>
                          )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right font-medium text-slate-700 text-xs sm:text-sm">
                      Rs. {(vendor.totalPurchased || 0).toLocaleString()}
                    </td>

                    <td className="px-6 py-4 text-right font-medium text-emerald-700 text-xs sm:text-sm">
                      Rs. {(vendor.totalPaid || 0).toLocaleString()}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {vendor.balance > 0 ? (
                        <span className="inline-flex items-center py-1 px-2.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Owe Rs. {vendor.balance.toLocaleString()}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500">
                      {vendor.lastActivityDate ? (
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {new Date(vendor.lastActivityDate).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/vendors/${vendor.id}`);
                        }}
                        className="p-2 text-slate-400 group-hover:text-indigo-600 rounded-lg group-hover:bg-indigo-50 transition-colors inline-block"
                        title="View Vendor Details"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
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

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-slate-500">
          Loading vendors...
        </div>
      }
    >
      <VendorsPageContent />
    </Suspense>
  );
}
