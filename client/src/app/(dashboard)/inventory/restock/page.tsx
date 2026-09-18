"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Search,
  Plus,
  Trash2,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Warehouse,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";

type Branch = {
  id: string;
  name: string;
  location?: string | null;
  cabinets: Cabinet[];
};

type Cabinet = {
  id: string;
  name: string;
  location?: string | null;
};

type Vendor = {
  id: string;
  businessName: string;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  stock: number;
};

type BatchLine = {
  productId: string;
  productName: string;
  branchId?: string | null;
  cabinetId?: string | null;
  condition: string;
  quantity: number;
  notes?: string;
};

const CONDITIONS = [
  "ORIGINAL_PULL",
  "COPY",
  "MINOR_SCRATCHES",
  "WORKING",
  "DEAD_DONOR",
  "DEFECTIVE",
];

export default function RestockPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Form state for the line being composed
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCabinetId, setSelectedCabinetId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [condition, setCondition] = useState("ORIGINAL_PULL");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  // Accumulator batch
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const selectedBranchCabinets = useMemo(() => {
    const branch = branches.find((b) => b.id === selectedBranchId);
    return branch?.cabinets || [];
  }, [branches, selectedBranchId]);

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/product/getbranches`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setBranches(data.branches);
    } catch (err) {
      console.error("Failed to load branches", err);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "All") params.set("category", activeCategory);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(
        `${API_BASE_URL}/product/getproducts?${params.toString()}`,
        { headers: getAuthHeaders() },
      );
      const data = await res.json();
      if (data.success) setProducts(data.products);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, searchQuery]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/product/getcategories`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success)
        setCategories(data.categories.map((c: any) => c.name).sort());
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  }, []);

  const loadVendors = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setVendors(data.vendors);
    } catch (err) {
      console.error("Failed to load vendors", err);
    }
  }, []);

  useEffect(() => {
    void loadBranches();
    void loadCategories();
    void loadProducts();
    void loadVendors();
  }, [loadBranches, loadCategories, loadProducts, loadVendors]);

  const handleAddToBatch = () => {
    if (!selectedProduct) {
      setErrorMsg("Select a product to add to the batch.");
      return;
    }
    const qty = Math.max(1, Number(quantity) || 1);
    const line: BatchLine = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      branchId: selectedBranchId || null,
      cabinetId: selectedCabinetId || null,
      condition,
      quantity: qty,
      notes: notes.trim() || undefined,
      vendorId: selectedVendorId || undefined,
    } as BatchLine & { vendorId?: string };

    setBatch((prev) => [...prev, line]);
    setErrorMsg("");
    setNotes("");
    setSelectedProductId("");
    setSelectedBranchId("");
    setSelectedCabinetId("");
    setSelectedVendorId("");
    setQuantity("1");
    setCondition("ORIGINAL_PULL");
  };

  const removeLine = (index: number) => {
    setBatch((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmRestock = async () => {
    if (batch.length === 0) {
      setErrorMsg("Batch is empty. Add at least one restock line.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = {
        items: batch.map((line) => ({
          productId: line.productId,
          branchId: line.branchId,
          cabinetId: line.cabinetId,
          condition: line.condition,
          quantity: line.quantity,
          notes: line.notes,
          vendorId: (line as any).vendorId,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/inventory/restock`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Restock failed");
      }

      setSuccessMsg(
        data.message ||
          `Restocked ${batch.reduce((s, l) => s + l.quantity, 0)} units.`,
      );
      setBatch([]);
      await loadProducts();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to restock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalUnits = batch.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden animate-in fade-in duration-500 mt-2 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Warehouse className="w-6 h-6 text-indigo-600" />
              Restock Hub
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                Batch
              </span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Bulk-load shipments into physical cabinets with full movement
              audit logging.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-500">Batch Total</p>
          <p className="text-2xl font-black text-slate-900">
            {totalUnits}
            <span className="text-sm font-semibold text-slate-400 ml-1">
              units
            </span>
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-800 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg("")}
            className="text-emerald-600 hover:text-emerald-800 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-bold text-rose-700 shadow-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden mt-3 gap-6">
        {/* LEFT: Catalog + Line Composer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0">
          {/* Search + Category */}
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0 bg-slate-50/50">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product to restock..."
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              {["All", ...categories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === cat ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                Select Product *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="">-- Choose a product to restock --</option>
                {isLoading ? (
                  <option disabled>Loading products...</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""} · {p.stock} in stock
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Composer Card */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Branch
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setSelectedCabinetId("");
                  }}
                  className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">-- No Branch (Default) --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Cabinet (Spatial Bin)
                </label>
                <select
                  value={selectedCabinetId}
                  onChange={(e) => setSelectedCabinetId(e.target.value)}
                  disabled={!selectedBranchId}
                  className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {selectedBranchId
                      ? "-- Select cabinet --"
                      : "-- Select a branch first --"}
                  </option>
                  {selectedBranchCabinets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.location ? `(${c.location})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Select Vendor (Optional)
                </label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">-- No Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.businessName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Condition *
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Supplier note / invoice reference (optional)"
                className="flex-1 border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button
                onClick={handleAddToBatch}
                disabled={!selectedProduct || isSubmitting}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add to Batch
              </button>
            </div>
          </div>

          {/* Compact catalog of available products */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Loading products...
              </div>
            ) : products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <Package className="w-8 h-8 mb-2 opacity-30" />
                No products match your search.
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${
                      selectedProductId === p.id
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {p.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {p.sku || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        Rs. {p.price.toLocaleString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          p.stock > 0
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {p.stock} left
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Batch Accumulator Table */}
        <div className="w-full lg:w-170 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" /> Restock Batch
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {batch.length} lines
              </span>
            </h2>
            <Boxes className="w-5 h-5 text-slate-300" />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {batch.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                <Layers className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Batch is empty</p>
                <p className="text-xs text-slate-400">
                  Add lines from the product panel to queue a shipment.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 pr-2 font-bold">Product</th>
                    <th className="py-2 pr-2 font-bold">Cabinet</th>
                    <th className="py-2 pr-2 font-bold">Condition</th>
                    <th className="py-2 pr-2 font-bold text-center">Qty</th>
                    <th className="py-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {batch.map((line, index) => (
                    <tr key={index} className="text-slate-700">
                      <td className="py-2.5 pr-2">
                        <p className="font-bold text-slate-900 truncate max-w-44">
                          {line.productName}
                        </p>
                        {line.notes && (
                          <p className="text-[10px] text-slate-400 truncate max-w-44">
                            {line.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-28">
                            {branches
                              .find((b) => b.id === line.branchId)
                              ?.cabinets.find((c) => c.id === line.cabinetId)
                              ?.name || "Default Cabinet"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {line.condition.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 text-center font-black text-slate-900">
                        {line.quantity}
                      </td>
                      <td className="py-2.5 text-right">
                        {user?.role !== "STAFF" && (
                          <button
                            onClick={() => removeLine(index)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500">
                Total Units
              </span>
              <span className="text-2xl font-black text-slate-900">
                {totalUnits}
              </span>
            </div>
            <button
              onClick={handleConfirmRestock}
              disabled={batch.length === 0 || isSubmitting}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting
                ? "Processing Batch..."
                : `Confirm Restock (${totalUnits} units)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
