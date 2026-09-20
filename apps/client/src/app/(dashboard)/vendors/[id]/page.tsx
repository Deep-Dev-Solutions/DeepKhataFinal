"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Phone,
  MapPin,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  CheckCircle2,
  Package,
  Layers,
  Clock,
  Tag,
  ExternalLink,
  Search,
  DollarSign,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Warehouse,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

const formatPrice = (val: any): string => {
  if (val === null || val === undefined) return "0";
  const num = Number(val);
  return (isNaN(num) ? 0 : num).toLocaleString();
};

export default function VendorProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [vendor, setVendor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Transaction form states
  const [actionType, setActionType] = useState<"purchase" | "payment">(
    "purchase",
  );
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txError, setTxError] = useState("");
  const [txSuccess, setTxSuccess] = useState("");

  // Tab & search states
  const [activeTab, setActiveTab] = useState<
    "products" | "inventory" | "ledger" | "movements"
  >("products");
  const [itemSearch, setItemSearch] = useState("");

  const fetchVendorData = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/vendors/${id}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to load vendor profile");
      }

      const formattedLedger = (data.vendor.ledger || []).map((item: any) => ({
        ...item,
        formattedDate: new Date(item.date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      setVendor({
        ...data.vendor,
        ledger: formattedLedger,
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load vendor profile",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void fetchVendorData();
    }
  }, [id, fetchVendorData]);

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTx(true);
    setTxError("");
    setTxSuccess("");

    try {
      const endpoint =
        actionType === "purchase"
          ? `/vendors/${id}/purchase`
          : `/vendors/${id}/payment`;
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: Number(txAmount),
          description: txDescription,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || `Failed to record ${actionType}`,
        );
      }

      setTxAmount("");
      setTxDescription("");
      setTxSuccess(
        actionType === "purchase"
          ? "Stock purchase recorded to ledger."
          : "Vendor payment recorded successfully.",
      );
      setTimeout(() => setTxSuccess(""), 4000);
      await fetchVendorData();
    } catch (error) {
      setTxError(
        error instanceof Error ? error.message : "Failed to record transaction",
      );
    } finally {
      setIsSubmittingTx(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <Building2 className="w-8 h-8 text-indigo-500 animate-bounce" />
          <p className="text-sm font-medium">Loading vendor profile...</p>
        </div>
      </div>
    );
  }

  if (pageError || !vendor) {
    return (
      <div className="p-6 text-center max-w-md mx-auto mt-10">
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mb-4">
          {pageError || "Vendor not found"}
        </div>
        <Link
          href="/vendors"
          className="text-indigo-600 font-semibold hover:underline"
        >
          &larr; Back to Vendors
        </Link>
      </div>
    );
  }

  const metrics = vendor.metrics || {};
  const products: any[] = vendor.products || [];
  const suppliedInventory: any[] = vendor.suppliedInventory || [];
  const movements: any[] = vendor.movements || [];

  const filteredProducts = products.filter((p) => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return (
      p.productName.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const filteredInventory = suppliedInventory.filter((item) => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return (
      item.productName.toLowerCase().includes(q) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.branchName && item.branchName.toLowerCase().includes(q)) ||
      (item.condition && item.condition.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-white border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/vendors"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                {vendor.businessName}
              </h1>
              {vendor.balance > 0 ? (
                <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-200">
                  Owe Rs. {formatPrice(vendor.balance)}
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Supplier & Vendor Profile
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActionType("purchase");
              const el = document.getElementById("tx-form");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            + Record Purchase
          </button>
          <button
            onClick={() => {
              setActionType("payment");
              const el = document.getElementById("tx-form");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            + Record Payment
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Total Purchases
            </p>
            <p className="text-base sm:text-lg font-black text-slate-900 truncate">
              Rs. {formatPrice(metrics.totalPurchases)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Total Paid
            </p>
            <p className="text-base sm:text-lg font-black text-emerald-700 truncate">
              Rs. {formatPrice(metrics.totalPaid)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${vendor.balance > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}
          >
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Balance Due
            </p>
            <p
              className={`text-base sm:text-lg font-black truncate ${vendor.balance > 0 ? "text-rose-600" : "text-emerald-700"}`}
            >
              Rs. {formatPrice(vendor.balance)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Units Supplied
            </p>
            <p className="text-base sm:text-lg font-black text-slate-900">
              {metrics.totalUnitsSupplied || 0}{" "}
              <span className="text-xs font-medium text-slate-400">units</span>
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Catalog Items
            </p>
            <p className="text-base sm:text-lg font-black text-slate-900">
              {metrics.distinctProductsCount || products.length}{" "}
              <span className="text-xs font-medium text-slate-400">prods</span>
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <Warehouse className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Stock Status
            </p>
            <p className="text-xs font-bold text-slate-900 truncate">
              <span className="text-emerald-600">
                {metrics.availableUnits || 0} in stock
              </span>
              <span className="text-slate-400"> · </span>
              <span className="text-slate-500">
                {metrics.soldUnits || 0} sold
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Vendor Info & Transaction Form */}
        <div
          className="w-full lg:w-[350px] flex flex-col gap-6 shrink-0"
          id="tx-form"
        >
          {/* Vendor Info Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Vendor Information
            </h3>
            <div className="space-y-3.5 text-sm">
              <div className="flex items-start gap-3 text-slate-700">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">
                    {vendor.contactName || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Contact Person</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900 font-mono text-xs">
                    {vendor.phone || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Phone Number</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-slate-700 pt-2 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-slate-800 leading-relaxed text-xs">
                    {vendor.address || "Not provided"}
                  </p>
                  <p className="text-[11px] text-slate-500">Address</p>
                </div>
              </div>
            </div>
          </div>

          {/* Record Transaction Card (Purchase / Payment) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ledger Transaction
              </h3>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActionType("purchase")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    actionType === "purchase"
                      ? "bg-white text-indigo-600 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Purchase
                </button>
                <button
                  type="button"
                  onClick={() => setActionType("payment")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    actionType === "payment"
                      ? "bg-white text-emerald-700 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Payment
                </button>
              </div>
            </div>

            <form onSubmit={handleRecordTransaction} className="space-y-4">
              {txError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-200">
                  {txError}
                </div>
              )}
              {txSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs border border-emerald-200">
                  {txSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {actionType === "purchase"
                    ? "Purchase Amount (Rs.) *"
                    : "Payment Amount to Vendor (Rs.) *"}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g. 50000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Reference Note
                </label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder={
                    actionType === "purchase"
                      ? "e.g. OLED Screens Batch #12"
                      : "e.g. Cash settlement for invoice"
                  }
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingTx || !txAmount}
                className={`w-full py-2.5 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                  actionType === "purchase"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                <Plus className="w-4 h-4" />
                {isSubmittingTx
                  ? "Recording..."
                  : actionType === "purchase"
                    ? "Add Purchase to Ledger"
                    : "Record Payment (Settle)"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Section: Multi-tab content */}
        <div className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Tabs bar */}
          <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTab("products")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "products"
                    ? "bg-white border border-slate-200 shadow-xs text-indigo-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Products Purchased
                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  {products.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("inventory")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "inventory"
                    ? "bg-white border border-slate-200 shadow-xs text-indigo-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Supplied Batches
                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  {suppliedInventory.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("ledger")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "ledger"
                    ? "bg-white border border-slate-200 shadow-xs text-indigo-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                Ledger (Accounts Payable)
                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  {vendor.ledger?.length || 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("movements")}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "movements"
                    ? "bg-white border border-slate-200 shadow-xs text-indigo-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Audit Logs
                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  {movements.length}
                </span>
              </button>
            </div>

            {(activeTab === "products" || activeTab === "inventory") && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Filter items..."
                  className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-44"
                />
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            {/* TAB 1: PRODUCTS PURCHASED (CATALOG VIEW) */}
            {activeTab === "products" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Category / SKU</th>
                      <th className="px-5 py-3 text-center">Total Sourced</th>
                      <th className="px-5 py-3 text-center">Current Stock</th>
                      <th className="px-5 py-3 text-right">Avg Unit Cost</th>
                      <th className="px-5 py-3 text-right">
                        Total Purchase Value
                      </th>
                      <th className="px-5 py-3">Branches</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-14 text-center text-slate-400"
                        >
                          <Package className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
                          <p className="font-semibold text-slate-600 text-sm">
                            No products found from this vendor
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Products attached to this vendor during creation or
                            restock will appear here.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr
                          key={p.productId}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/products/${p.productId}`}
                              className="font-bold text-slate-900 hover:text-indigo-600 transition-colors block text-xs sm:text-sm hover:underline"
                            >
                              {p.productName}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {p.category}
                              </span>
                              {p.sku && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {p.sku}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {p.totalQuantity} units
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`font-bold px-2 py-0.5 rounded text-xs ${
                                p.availableQuantity > 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {p.availableQuantity} available
                            </span>
                            {p.soldQuantity > 0 && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                ({p.soldQuantity} sold)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-slate-700 text-xs sm:text-sm">
                            {p.avgUnitCost > 0
                              ? `Rs. ${formatPrice(p.avgUnitCost)}`
                              : "-"}
                          </td>
                          <td className="px-5 py-3.5 text-right font-black text-indigo-600 text-xs sm:text-sm">
                            {p.totalCost > 0
                              ? `Rs. ${formatPrice(p.totalCost)}`
                              : "-"}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 flex-wrap max-w-xs">
                              {p.branches?.map((b: string) => (
                                <span
                                  key={b}
                                  className="text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200/60 px-1.5 py-0.5 rounded"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={`/products/${p.productId}`}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors inline-block"
                              title="View product details"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: SUPPLIED INVENTORY BATCHES */}
            {activeTab === "inventory" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Received Date</th>
                      <th className="px-5 py-3">Product Name</th>
                      <th className="px-5 py-3">Condition</th>
                      <th className="px-5 py-3">Branch & Cabinet</th>
                      <th className="px-5 py-3 text-center">Batch Qty</th>
                      <th className="px-5 py-3 text-center">Stock Status</th>
                      <th className="px-5 py-3 text-right">Unit Cost</th>
                      <th className="px-5 py-3 text-right">Total Batch Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-14 text-center text-slate-400"
                        >
                          <Layers className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
                          <p className="font-semibold text-slate-600 text-sm">
                            No inventory batches found
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Physical product instances sourced from this vendor
                            will appear here.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map((item: any) => (
                        <tr
                          key={item.key}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-5 py-3.5 text-xs text-slate-500 font-medium">
                            {new Date(item.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/products/${item.productId}`}
                              className="font-bold text-slate-800 text-xs sm:text-sm hover:text-indigo-600 hover:underline block"
                            >
                              {item.productName}
                            </Link>
                            {item.sku && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {item.sku}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {item.condition?.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="text-xs">
                              <span className="font-medium text-slate-700 block">
                                {item.branchName}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {item.cabinetName}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {item.quantity} units
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-xs font-semibold text-emerald-700">
                              {item.availableCount} avail
                            </span>
                            {item.soldCount > 0 && (
                              <span className="text-xs font-medium text-slate-400 block">
                                {item.soldCount} sold
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="font-medium text-slate-700 text-xs">
                              {item.unitCost !== null &&
                              item.unitCost !== undefined
                                ? `Rs. ${formatPrice(item.unitCost)}`
                                : "-"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-black text-indigo-600 text-xs sm:text-sm">
                            {item.totalCost > 0
                              ? `Rs. ${formatPrice(item.totalCost)}`
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: LEDGER (ACCOUNTS PAYABLE) */}
            {activeTab === "ledger" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Date & Time</th>
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-right">Credit (We Owe)</th>
                      <th className="px-5 py-3 text-right">Debit (We Paid)</th>
                      <th className="px-5 py-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!vendor.ledger || vendor.ledger.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-14 text-center text-slate-400"
                        >
                          <Wallet className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
                          <p className="font-semibold text-slate-600 text-sm">
                            No ledger transactions found
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Record a credit purchase or payment on the left to
                            start tracking payables.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      vendor.ledger.map((item: any) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-5 py-3.5 text-xs text-slate-500 font-medium">
                            {item.formattedDate}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-slate-800 text-xs sm:text-sm">
                              {item.description}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.type === "VENDOR_PAYMENT"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-indigo-50 text-indigo-700"
                              }`}
                            >
                              {item.type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {item.credit > 0 ? (
                              <span className="font-bold text-rose-600">
                                Rs. {formatPrice(item.credit)}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {item.debit > 0 ? (
                              <span className="font-bold text-emerald-600">
                                Rs. {formatPrice(item.debit)}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="font-black text-slate-900">
                              Rs. {formatPrice(item.balance)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 4: AUDIT LOGS */}
            {activeTab === "movements" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-center">Qty</th>
                      <th className="px-5 py-3">Cabinet</th>
                      <th className="px-5 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-14 text-center text-slate-400"
                        >
                          <Clock className="w-10 h-10 mx-auto mb-2 opacity-25 text-slate-400" />
                          <p className="font-semibold text-slate-600 text-sm">
                            No movement logs
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Stock movements for this vendor will appear here.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      movements.map((m: any) => (
                        <tr
                          key={m.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-5 py-3.5 text-slate-600 text-xs">
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-800 text-xs sm:text-sm">
                            {m.product?.name || "Product"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.direction === "IN"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {m.direction} - {m.referenceType}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center font-black text-slate-900">
                            {m.direction === "IN" ? "+" : "-"}
                            {m.quantity}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {m.cabinet?.name || "-"}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">
                            {m.notes || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
