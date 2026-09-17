"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Phone,
  ArrowRight,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

type VendorRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  balance: number;
};

function VendorsPageContent() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

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

  const totalPayable = vendors.reduce(
    (sum, v) => sum + (v.balance > 0 ? v.balance : 0),
    0,
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            Vendor Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your suppliers and track accounts payable.
          </p>
        </div>
        <button
          onClick={() => router.push("/vendors/new")}
          className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" /> New Vendor
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">
              Total Accounts Payable
            </p>
            <p className="text-2xl font-bold text-indigo-900">
              Rs. {isLoading ? "..." : totalPayable.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Active Vendors</p>
            <p className="text-2xl font-bold text-slate-900">
              {isLoading ? "..." : vendors.length}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-slate-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Vendor Details</th>
                <th className="px-6 py-4 font-semibold">Account Payable</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td
                    className="px-6 py-8 text-slate-500 text-center"
                    colSpan={3}
                  >
                    <span className="animate-pulse">Loading vendors...</span>
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td
                    className="px-6 py-8 text-slate-500 text-center"
                    colSpan={3}
                  >
                    No vendors found.
                  </td>
                </tr>
              ) : (
                vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/vendors/${vendor.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {vendor.businessName}
                        </span>
                        {vendor.contactName && (
                          <span className="text-slate-500 text-xs mt-0.5">
                            {vendor.contactName}
                          </span>
                        )}
                        {vendor.phone && (
                          <span className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {vendor.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {vendor.balance > 0 ? (
                        <span className="inline-flex items-center py-1 px-2.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Owe Rs. {vendor.balance.toLocaleString()}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Settled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 group-hover:text-indigo-600 rounded-lg group-hover:bg-indigo-50 transition-colors">
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
