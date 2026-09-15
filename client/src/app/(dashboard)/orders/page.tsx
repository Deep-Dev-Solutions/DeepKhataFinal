"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Calendar,
  MessageCircle,
  Package,
  LayoutList,
  KanbanSquare,
  Download,
  AlertCircle,
} from "lucide-react";
import OrderMetrics from "@/components/orders/OrderMetrics";
import OrderTable from "@/components/orders/OrderTable";
import OrderPagination from "@/components/orders/OrderPagination";

const API_BASE_URL = "http://localhost:5000";

const getAuthHeaders = () => {
  if (typeof window === "undefined") {
    return { "Content-Type": "application/json" };
  }

  const accessToken = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
};

const getFriendlyDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) {
    if (date.getDate() === now.getDate()) {
      return `Today, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return "Yesterday";
  }
  if (diffDays === 2) return "2 days ago";
  if (diffDays === 3) return "3 days ago";
  if (diffDays <= 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function OrdersHubPage() {
  const [activeTab, setActiveTab] = useState("all-orders");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [days, setDays] = useState(7);
  const [isDaysMenuOpen, setIsDaysMenuOpen] = useState(false);

  // 🟢 NEW PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to page 1 when searching
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // When changing tabs, reset pagination
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const refreshOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      params.set("days", days.toString());

      const response = await fetch(
        `${API_BASE_URL}/order/getallorders?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok)
        throw new Error(
          data?.message || data?.error || "Failed to load orders",
        );

      const rawOrders = data?.orders || [];
      const normalized = rawOrders.map((order: any) => ({
        id: order.id,
        // 🟢 FIX: Map the auto-increment orderNumber from DB
        orderNumber: `ORD-${order.orderNumber || order.id.substring(0, 4)}`,
        customer: order.customer
          ? order.customer.name
          : order.walkInName || "Walk-in Customer",
        phone: order.customer
          ? order.customer.phone
          : order.walkInPhone || "N/A",
        total: Number(order.totalAmount ?? 0),
        status: order.status,
        paymentStatus: order.paymentStatus, // Use actual database field name
        pendingBalance: Number(order.pendingBalance ?? 0), // Use exact math from backend!
        date: getFriendlyDate(order.createdAt),
      }));

      setOrders(normalized);
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, days]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  // 🟢 SMART FILTER LOGIC
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (activeTab === "pending" || activeTab === "memo")
        return order.status === "MEMO" || order.status === "PENDING";
      if (activeTab === "completed" || activeTab === "final")
        return order.status === "FINAL" || order.status === "COMPLETED";
      if (activeTab === "needs-attention")
        return (
          (order.status === "FINAL" || order.status === "COMPLETED") &&
          order.paymentStatus !== "PAID"
        );
      if (activeTab === "all-orders") return order.status !== "CANCELLED";
      return true;
    });
  }, [orders, activeTab]);

  // 🟢 PAGINATION LOGIC
  const totalItems = filteredOrders.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentOrdersOnPage = filteredOrders.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  const toggleSelection = (id: string) => {
    setSelectedOrders((prev) =>
      prev.includes(id)
        ? prev.filter((orderId) => orderId !== id)
        : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (selectedOrders.length === currentOrdersOnPage.length)
      setSelectedOrders([]);
    else setSelectedOrders(currentOrdersOnPage.map((o) => o.id));
  };

  return (
    <div className="relative min-h-[80vh] flex flex-col space-y-4 animate-in fade-in duration-500 pb-20">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Orders Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage lifecycle, payments, and dispatch tracking.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> Create Order
        </Link>
      </div>

      {/* TABS & VIEW TOGGLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex overflow-x-auto hide-scrollbar gap-2">
          {[
            "All Orders",
            "Memo / Amanat",
            "Needs Attention",
            "Final Sales",
          ].map((tab) => {
            const id =
              tab === "Memo / Amanat"
                ? "pending"
                : tab === "Final Sales"
                  ? "completed"
                  : tab.toLowerCase().replace(" ", "-");
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${activeTab === id ? (id === "needs-attention" ? "bg-rose-100 text-rose-700" : "bg-slate-900 text-white") : "bg-transparent text-slate-600 hover:bg-slate-100"}`}
              >
                {tab}
                {/* Dynamically show count on the Needs Attention tab! */}
                {id === "needs-attention" && (
                  <span className="ml-2 inline-flex items-center justify-center bg-rose-500 text-white text-[10px] w-5 h-5 rounded-full">
                    {
                      orders.filter(
                        (o) =>
                          (o.status === "FINAL" || o.status === "COMPLETED") &&
                          o.paymentStatus !== "PAID",
                      ).length
                    }
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-3 relative">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order ID, Customer, or Phone..."
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setIsDaysMenuOpen(!isDaysMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium bg-white hover:bg-slate-50 w-full sm:w-auto"
          >
            <Calendar className="w-4 h-4" /> Last {days} Days
          </button>
          {isDaysMenuOpen && (
            <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-lg border border-slate-200 p-2 z-20 animate-in fade-in slide-in-from-top-2">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDays(d);
                    setIsDaysMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${days === d ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Last {d} Days
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🟢 NEW METRICS WIDGET (Must use filteredOrders for exact totals) */}
      <OrderMetrics orders={filteredOrders} activeTab={activeTab} />

      {/* 🟢 DATA TABLE & PAGINATION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        {error && (
          <div className="bg-rose-50 border-b border-rose-100 px-6 py-3 text-sm text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Loading orders from server...
          </div>
        ) : currentOrdersOnPage.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No orders found matching your filters.
          </div>
        ) : (
          <OrderTable
            orders={currentOrdersOnPage} // 🟢 Pass only 10 items!
            selectedOrders={selectedOrders}
            toggleSelection={toggleSelection}
            toggleAll={toggleAll}
          />
        )}

        {/* 🟢 PASS PROPS TO PAGINATION */}
        {totalItems > 0 && (
          <OrderPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            indexOfFirstItem={indexOfFirstItem + 1}
            indexOfLastItem={Math.min(indexOfLastItem, totalItems)}
            onNextPage={() =>
              setCurrentPage((p) => Math.min(p + 1, totalPages))
            }
            onPrevPage={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          />
        )}
      </div>

      {/* FLOATING BULK ACTION BAR */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-20 md:bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 z-40 animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium border-r border-slate-700 pr-4">
            {selectedOrders.length} orders selected
          </span>
          <button className="text-sm hover:text-blue-400 flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4" /> Remind
          </button>
          <button className="text-sm hover:text-emerald-400 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      )}
    </div>
  );
}
