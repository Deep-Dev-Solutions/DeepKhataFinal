"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Users,
  Phone,
  ArrowRight,
  Filter,
  MessageCircle,
  Wallet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { offlineDb } from "@/lib/db";

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  lifetimeValue: number;
  balance: number;
};

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

function CustomersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(
    searchParams.get("unpaid") === "true",
  );
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [pageError, setPageError] = useState("");

  // Quick Add State
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Debounce search query to prevent spamming the rate-limited endpoint
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Synchronize search query and filter with URL params
  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
    if (showUnpaidOnly) params.set("unpaid", "true");

    const currentQuery = searchParams.toString();
    const newQuery = params.toString();

    if (currentQuery !== newQuery) {
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [debouncedSearchQuery, showUnpaidOnly, pathname, searchParams]);

  // Fetch customers from backend
  const refreshCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    setPageError("");

    try {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      if (showUnpaidOnly) params.set("unpaid", "true");

      const response = await fetch(
        `${API_BASE_URL}/customer/getallcustomers?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to load customers",
        );
      }

      const customerList = data?.customers || [];
      setCustomers(customerList);
      if (Array.isArray(customerList) && customerList.length > 0) {
        void offlineDb.customers.bulkPut(customerList);
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load customers",
      );
      setCustomers([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [debouncedSearchQuery, showUnpaidOnly]);

  // Fetch customers on load and when dependencies change
  useEffect(() => {
    void refreshCustomers();
  }, [refreshCustomers]);

  // --- ACTIONS ---
  const handleAddCustomer = async () => {
    const nameTrimmed = newName.trim();
    const phoneTrimmed = newPhone.trim();

    if (!nameTrimmed || !phoneTrimmed) return;

    setIsSaving(true);
    setPageError("");

    try {
      const response = await fetch(`${API_BASE_URL}/customer/newcustomer`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: nameTrimmed,
          phone: phoneTrimmed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to add customer",
        );
      }

      await refreshCustomers();
      setNewName("");
      setNewPhone("");
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to add customer",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- MATH & FILTERS ---
  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.balance, 0);
  const unpaidCustomersCount = customers.filter((c) => c.balance > 0).length;
  const settledCustomersCount = customers.length - unpaidCustomersCount;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* 🟢 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Customers & Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your clients, track outstanding balances, and send reminders.
          </p>
        </div>
      </div>

      {/* 🟢 2. CRM METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Total Customers
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {isLoadingCustomers ? "..." : customers.length}
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* The most important metric for the owner */}
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600">
              Total Outstanding Debt
            </p>
            <p className="text-2xl font-bold text-rose-700">
              Rs.{" "}
              {isLoadingCustomers
                ? "..."
                : totalOutstandingDebt.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-rose-100 rounded-lg text-rose-600">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Accounts Settled
            </p>
            <p className="text-2xl font-bold text-emerald-800">
              {isLoadingCustomers ? "..." : settledCustomersCount} clients
            </p>
          </div>
          <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 🟢 3. SEARCH & FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name or phone..."
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
          />
        </div>

        {/* Active Toggle Button */}
        <button
          onClick={() => setShowUnpaidOnly(!showUnpaidOnly)}
          className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors w-full sm:w-auto ${
            showUnpaidOnly
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
          }`}
        >
          <Filter className="w-4 h-4" />
          {showUnpaidOnly ? "Showing Unpaid" : "Unpaid Only"}
        </button>
      </div>

      {/* 🟢 4. INLINE CRM TABLE */}
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
                <th className="px-6 py-4 font-semibold">Customer Details</th>
                <th className="px-6 py-4 font-semibold">Orders</th>
                <th className="px-6 py-4 font-semibold">Lifetime Spend</th>
                <th className="px-6 py-4 font-semibold">Outstanding Balance</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {/* --- ⚡ INLINE QUICK-ADD ROW --- */}
              <tr className="bg-blue-50/30">
                <td className="px-6 py-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="+ New Customer Name"
                      className="w-full bg-white border border-blue-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-blue-300 font-medium"
                      disabled={isSaving}
                    />
                    <input
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="w-full bg-white border border-blue-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-blue-300"
                      disabled={isSaving}
                    />
                  </div>
                </td>
                <td className="px-6 py-3 text-slate-400">-</td>
                <td className="px-6 py-3 text-slate-400">-</td>
                <td className="px-6 py-3 text-slate-400">-</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={handleAddCustomer}
                    disabled={!newName || !newPhone || isSaving}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors ml-auto flex items-center gap-1"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </td>
              </tr>

              {/* --- ACTUAL DATA ROWS --- */}
              {isLoadingCustomers ? (
                <tr>
                  <td
                    className="px-6 py-8 text-slate-500 text-center"
                    colSpan={5}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="animate-pulse">
                        Loading customers from server...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    className="px-6 py-8 text-slate-500 text-center"
                    colSpan={5}
                  >
                    No customers found.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  // Generate WhatsApp message for reminders
                  const waMessage = encodeURIComponent(
                    `Hello ${customer.name}, this is a gentle reminder that an amount of Rs. ${customer.balance.toLocaleString()} is currently pending. Please settle at your earliest convenience.`,
                  );

                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => router.push(`/customers/${customer.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {customer.name}
                          </span>
                          <a
                            href={`tel:${customer.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 text-xs flex items-center gap-1 mt-0.5 hover:text-blue-600"
                          >
                            <Phone className="w-3 h-3" />
                            {customer.phone}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {customer.totalOrders}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        Rs. {customer.lifetimeValue.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {customer.balance > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center py-1 px-2.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Owes Rs. {customer.balance.toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Settled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* 🟢 WhatsApp Reminder Button (Only shows if they owe money) */}
                          {customer.balance > 0 && (
                            <a
                              href={`https://wa.me/92${customer.phone.replace(/[^0-9]/g, "").substring(1)}?text=${waMessage}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                              title="Send WhatsApp Reminder"
                            >
                              <MessageCircle className="w-4 h-4" />
                              <span className="hidden xl:inline">Remind</span>
                            </a>
                          )}

                          <button className="p-2 text-slate-400 group-hover:text-blue-600 rounded-lg group-hover:bg-blue-50 transition-colors">
                            <ArrowRight className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-slate-500">
          Loading customers...
        </div>
      }
    >
      <CustomersPageContent />
    </Suspense>
  );
}
