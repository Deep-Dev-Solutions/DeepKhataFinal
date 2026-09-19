"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  MapPin,
  Clock,
  Archive,
  BarChart2,
  Tag,
  Warehouse,
  Barcode,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  User,
  Calendar,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

const formatPrice = (val: any): string => {
  if (val === null || val === undefined) return "0";
  const num = Number(val);
  return (isNaN(num) ? 0 : num).toLocaleString();
};

type Instance = {
  id: string;
  condition: string;
  branch: { id: string; name: string };
  cabinet?: { id: string; name: string };
};

type Movement = {
  id: string;
  createdAt: string;
  quantity: number;
  direction: string;
  referenceType: string;
  notes: string;
  fromCondition: string | null;
  toCondition: string;
  vendor?: { businessName: string };
  cabinet?: { name: string };
};

type SaleItem = {
  id: string;
  orderId: string;
  orderNumber: number;
  createdAt: string;
  quantity: number;
  price: number;
  total: number;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone?: string | null;
  branchName: string;
  creatorName?: string | null;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  stock: number;
  totalSold?: number;
  totalRevenue?: number;
  category?: { name: string };
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"location" | "sales" | "audit">(
    "location",
  );

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/product/${id}/details`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success) {
          setProduct(data.product);
          const instList = data.instances || [];
          const saleList = data.sales || [];
          setInstances(instList);
          setMovements(data.movements || []);
          setSales(saleList);
          if (instList.length === 0 && saleList.length > 0) {
            setActiveTab("sales");
          }
        }
      } catch (err) {
        console.error("Failed to load product details", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchDetails();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin text-indigo-600">
          <BarChart2 className="w-8 h-8" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6 text-center text-slate-500">Product not found.</div>
    );
  }

  // Group instances by Branch -> Cabinet -> Condition
  const locationBreakdown: Record<string, any> = {};
  instances.forEach((inst) => {
    const branchName = inst.branch.name;
    const cabinetName = inst.cabinet?.name || "No Cabinet";
    const condition = inst.condition.replace(/_/g, " ");

    if (!locationBreakdown[branchName]) {
      locationBreakdown[branchName] = {};
    }
    if (!locationBreakdown[branchName][cabinetName]) {
      locationBreakdown[branchName][cabinetName] = {};
    }
    if (!locationBreakdown[branchName][cabinetName][condition]) {
      locationBreakdown[branchName][cabinetName][condition] = 0;
    }

    locationBreakdown[branchName][cabinetName][condition] += 1;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 font-sans">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 shadow-sm transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-500">
            Product Details & Performance
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              In Stock
            </p>
            <p className="text-lg sm:text-xl font-black text-slate-900">
              {product.stock}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Base Price
            </p>
            <p className="text-lg sm:text-xl font-black text-slate-900 truncate">
              Rs. {formatPrice(product.basePrice)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Total Sold
            </p>
            <p className="text-lg sm:text-xl font-black text-blue-600">
              {product.totalSold || 0}{" "}
              <span className="text-xs font-semibold text-slate-400">
                units
              </span>
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Sales Revenue
            </p>
            <p className="text-lg sm:text-xl font-black text-purple-700 truncate">
              Rs. {formatPrice(product.totalRevenue)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              Category
            </p>
            <p className="text-sm font-bold text-slate-900 truncate">
              {product.category?.name || "Uncategorized"}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl shrink-0">
            <Barcode className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
              SKU
            </p>
            <p className="text-sm font-bold text-slate-900 truncate font-mono">
              {product.sku}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab("location")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "location"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <MapPin className="w-4 h-4" />
          Location Breakdown
        </button>
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "sales"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Sales History
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === "sales"
                ? "bg-blue-500 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {sales.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "audit"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Clock className="w-4 h-4" />
          Audit Trail
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {activeTab === "location" && (
          <div className="p-4 overflow-y-auto">
            {Object.keys(locationBreakdown).length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No available physical instances across any branch.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(locationBreakdown).map(
                  ([branch, cabinets]: [string, any]) => (
                    <div
                      key={branch}
                      className="border border-slate-100 rounded-xl overflow-hidden"
                    >
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold text-slate-800">{branch}</h3>
                      </div>
                      <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(cabinets).map(
                          ([cabinet, conditions]: [string, any]) => (
                            <div
                              key={cabinet}
                              className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm"
                            >
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-100 pb-2">
                                {cabinet}
                              </div>
                              <ul className="space-y-2">
                                {Object.entries(conditions).map(
                                  ([cond, qty]: [string, any]) => (
                                    <li
                                      key={cond}
                                      className="flex justify-between items-center text-sm"
                                    >
                                      <span className="font-medium text-slate-700">
                                        {cond}
                                      </span>
                                      <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                        {qty}
                                      </span>
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "sales" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Order #</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5 text-center">Qty Sold</th>
                  <th className="px-5 py-3.5 text-right">Unit Price</th>
                  <th className="px-5 py-3.5 text-right">Line Total</th>
                  <th className="px-5 py-3.5 text-center">Order Status</th>
                  <th className="px-5 py-3.5 text-center">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-14 text-center text-slate-400"
                    >
                      <ShoppingCart className="w-10 h-10 mx-auto mb-2.5 opacity-25 text-slate-400" />
                      <p className="font-semibold text-slate-600 text-sm">
                        No sales recorded yet
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        This product has not been sold in any orders yet.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-slate-600 text-xs font-medium">
                        {new Date(s.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/orders/${s.orderId}`}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:underline transition-colors"
                        >
                          #{s.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-bold text-slate-800 text-xs sm:text-sm">
                            {s.customerName}
                          </p>
                          {s.customerPhone && (
                            <p className="text-[11px] text-slate-400 font-mono">
                              {s.customerPhone}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200/60">
                          {s.branchName}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="font-black text-slate-900 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs">
                          {s.quantity}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700 text-xs sm:text-sm">
                        Rs. {formatPrice(s.price)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-blue-600 text-xs sm:text-sm">
                        Rs. {formatPrice(s.total)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            s.status === "FINAL" || s.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : s.status === "MEMO" || s.status === "PENDING"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : s.status === "ESTIMATE"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : s.status === "CANCELLED"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.paymentStatus === "PAID"
                              ? "bg-emerald-50 text-emerald-700"
                              : s.paymentStatus === "PARTIAL"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {s.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-center">Qty</th>
                  <th className="px-4 py-3">Condition (To)</th>
                  <th className="px-4 py-3">Location / Vendor</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      No movement history.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            m.direction === "IN"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {m.direction} - {m.referenceType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-slate-900">
                        {m.direction === "IN" ? "+" : "-"}
                        {m.quantity}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {m.toCondition.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {m.referenceType === "RESTOCK"
                          ? m.vendor?.businessName || "Unknown Vendor"
                          : m.cabinet?.name || "N/A"}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500 truncate max-w-[200px]"
                        title={m.notes || ""}
                      >
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
  );
}
