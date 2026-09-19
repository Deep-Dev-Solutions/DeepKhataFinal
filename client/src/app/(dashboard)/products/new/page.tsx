"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Barcode,
  Archive,
  MapPin,
  Tag,
  Check,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Settings2,
  Loader2,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth, type Branch } from "@/context/AuthContext";

type ItemConditionType =
  | "ORIGINAL_PULL"
  | "COPY"
  | "MINOR_SCRATCHES"
  | "WORKING"
  | "DEAD_DONOR"
  | "DEFECTIVE";

type ProductFormValues = {
  name: string;
  sku: string;
  category: string;
  price: number;
  branchId?: string;
  rack: string;
  shelf: string;
  bin: string;
  cabinetId?: string;
  condition: ItemConditionType;
  quantity: number;
  vendorId?: string;
};

type Vendor = {
  id: string;
  businessName: string;
};

interface CabinetOption {
  id: string;
  name: string;
  location?: string | null;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

const CONDITION_OPTIONS: {
  value: ItemConditionType;
  label: string;
  desc: string;
  badgeColor: string;
}[] = [
  {
    value: "ORIGINAL_PULL",
    label: "Original Pull",
    desc: "Genuine OEM pulled from device",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    value: "COPY",
    label: "Copy / Aftermarket",
    desc: "Compatible third-party replacement",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "MINOR_SCRATCHES",
    label: "Minor Scratch",
    desc: "Fully functional, slight aesthetic wear",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "WORKING",
    label: "Working Tested",
    desc: "Tested standard working condition",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    value: "DEAD_DONOR",
    label: "Dead Donor",
    desc: "For ICs, connectors, and board scraping",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    value: "DEFECTIVE",
    label: "Defective",
    desc: "Faulty unit kept for diagnosis or disposal",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
  },
];

export default function AddProductPage() {
  const router = useRouter();
  const { activeBranchId, branches: authBranches } = useAuth();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const [branches, setBranches] = useState<Branch[]>(
    Array.isArray(authBranches) ? authBranches : [],
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    activeBranchId || "",
  );
  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [rack, setRack] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [condition, setCondition] =
    useState<ItemConditionType>("ORIGINAL_PULL");
  const [quantity, setQuantity] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (Array.isArray(authBranches) && authBranches.length > 0) {
      setBranches(authBranches);
    }
  }, [authBranches]);

  // Default the instance branch to the active branch once it resolves.
  useEffect(() => {
    if (activeBranchId) {
      setSelectedBranchId((prev) => prev || activeBranchId);
    }
  }, [activeBranchId]);

  // Fallback: fetch branches from the backend in case AuthContext has none yet.
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/product/getbranches`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (response.ok && data.success && Array.isArray(data.branches)) {
          setBranches(data.branches);
          setSelectedBranchId((prev) => prev || data.branches[0]?.id || "");
        }
      } catch {
        /* AuthContext branches are used instead */
      }
    };
    void loadBranches();
  }, []);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [catRes, cabRes, venRes] = await Promise.all([
          fetch(`${API_BASE_URL}/product/getcategories`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE_URL}/product/getcabinets`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE_URL}/vendors`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const catData = await catRes.json();
        const cabData = await cabRes.json();
        const venData = await venRes.json();

        if (catData.success && Array.isArray(catData.categories)) {
          setCategories(catData.categories.map((c: any) => c.name));
        }
        if (cabData.success && Array.isArray(cabData.cabinets)) {
          setCabinets(cabData.cabinets);
        }
        if (venData.success && Array.isArray(venData.vendors)) {
          setVendors(venData.vendors);
        }
      } catch (err) {
        console.error("Failed to load categories/cabinets:", err);
      }
    };
    void loadMeta();
  }, []);

  const onCabinetSelect = (cabId: string) => {
    setSelectedCabinetId(cabId);
    const cab = cabinets.find((c) => c.id === cabId);
    if (cab) {
      setRack(cab.rack || "");
      setShelf(cab.shelf || "");
      setBin(cab.bin || "");
      if (cab.branch?.id) setSelectedBranchId(cab.branch.id);
    }
  };

  const branchCabinets = selectedBranchId
    ? cabinets.filter((c) => c.branch?.id === selectedBranchId)
    : cabinets;

  const cabinetLabel = (cab: CabinetOption) => {
    const segs = [
      cab.rack ? `Rack ${cab.rack}` : null,
      cab.shelf ? `Shelf ${cab.shelf}` : null,
      cab.bin ? `Bin ${cab.bin}` : null,
    ].filter(Boolean);
    const where = segs.length ? segs.join(" · ") : cab.location || "General";
    return `${cab.name} — ${where} (${cab.branch?.name || "No branch"})`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !category || !selectedBranchId) {
      setPageError(
        !selectedBranchId
          ? "Select a branch for the physical stock."
          : "Fill in the required fields first.",
      );
      return;
    }

    setIsSubmitting(true);
    setPageError("");
    setSuccessMsg("");

    try {
      const payload: ProductFormValues = {
        name: name.trim(),
        sku: sku.trim() || `PART-${Math.floor(1000 + Math.random() * 9000)}`,
        category,
        price: Number(price),
        branchId: selectedBranchId || undefined,
        rack: rack.trim(),
        shelf: shelf.trim(),
        bin: bin.trim(),
        cabinetId: selectedCabinetId || undefined,
        condition,
        quantity: Math.max(1, Number(quantity) || 1),
        vendorId: selectedVendorId || undefined,
      };

      const response = await fetch(`${API_BASE_URL}/product/addproduct`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to add product",
        );
      }

      setSuccessMsg(
        `Product "${payload.name}" created with ${payload.quantity} instance(s) in the spatial location.`,
      );
      setName("");
      setSku("");
      setPrice("");
      setCategory("");
      setRack("");
      setShelf("");
      setBin("");
      setSelectedCabinetId("");
      setSelectedVendorId("");
      setCondition("ORIGINAL_PULL");
      setQuantity("1");

      setTimeout(() => router.push("/products"), 900);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to add product",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const input =
    "w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-shadow";
  const label =
    "block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide";

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12 mt-2 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 pb-5 border-b border-slate-200 mb-6">
        <Link
          href="/products"
          className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Archive className="w-6 h-6 text-blue-600" />
            Add Product
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catalog a spare part, map its physical home, and profile its
            condition.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm font-bold text-emerald-800 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {pageError && (
        <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-sm font-semibold text-rose-800 shadow-sm animate-in fade-in">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            {pageError}
          </span>
          <button
            onClick={() => setPageError("")}
            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ───── LEFT COLUMN: BASIC INFO ───── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                Basic Details
              </h3>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Catalog Info
              </span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={label}>Product / Part Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. iPhone 13 Pro Max OLED Display"
                  className={input}
                />
              </div>

              <div>
                <label className={label}>Category *</label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`${input} cursor-pointer`}
                >
                  <option value="" disabled>
                    Select category...
                  </option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Settings2 className="w-3 h-3" />
                  Manage categories in
                  <Link
                    href="/settings/categories"
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Settings
                  </Link>
                </p>
              </div>

              <div>
                <label className={label}>SKU / Part Serial</label>
                <div className="relative">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. DSP-IP13PM-001 (auto-generated if empty)"
                    className={`${input} pl-9 font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Selling Price (Rs) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className={input}
                  />
                </div>
                <div>
                  <label className={label}># Instances *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="1"
                    className={input}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {Math.max(1, Number(quantity) || 1)} discrete physical
                    record(s) created
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ───── RIGHT COLUMN: SPATIAL & CONDITION ───── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                Spatial Location & Condition
              </h3>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Hafeez Centre Mapping
              </span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={label}>Branch (for physical stock) *</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setSelectedCabinetId("");
                  }}
                  className={`${input} cursor-pointer`}
                >
                  <option value="" disabled>
                    Select a branch...
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  The master product stays global — only its physical units are
                  placed in this branch.
                </p>
              </div>

              <div>
                <label className={label}>
                  Existing Rack / Shelf / Bin (from Cabinets)
                </label>
                <select
                  value={selectedCabinetId}
                  onChange={(e) => onCabinetSelect(e.target.value)}
                  className={`${input} cursor-pointer`}
                >
                  <option value="">
                    {branchCabinets.length
                      ? "-- Choose an existing spatial cabinet --"
                      : "-- No cabinets set up in this branch yet --"}
                  </option>
                  {branchCabinets.map((cab) => (
                    <option key={cab.id} value={cab.id}>
                      {cabinetLabel(cab)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Or, set up the layout in
                  <Link
                    href="/settings/cabinets"
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Settings &rarr; Cabinets
                  </Link>
                </p>
              </div>

              <div>
                <label className={label}>Select Vendor (Optional)</label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className={`${input} cursor-pointer`}
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
                <label className={label}>
                  Rack / Shelf / Bin
                  {selectedCabinetId
                    ? " (prefilled from selected cabinet)"
                    : " (auto-creates a cabinet if blank)"}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={rack}
                    onChange={(e) => setRack(e.target.value)}
                    placeholder="Rack A"
                    className={input}
                  />
                  <input
                    type="text"
                    value={shelf}
                    onChange={(e) => setShelf(e.target.value)}
                    placeholder="Shelf 2"
                    className={input}
                  />
                  <input
                    type="text"
                    value={bin}
                    onChange={(e) => setBin(e.target.value)}
                    placeholder="Bin 04"
                    className={input}
                  />
                </div>
              </div>

              <hr className="border-slate-100" />

              <div>
                <label className={`${label} flex items-center gap-1.5`}>
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  Item Condition *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CONDITION_OPTIONS.map((opt) => {
                    const isSelected = condition === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setCondition(opt.value)}
                        className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900 leading-tight">
                            {opt.label}
                          </span>
                          <span className="block text-[10px] text-slate-500 leading-tight truncate">
                            {opt.desc}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
          <Link
            href="/products"
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-70 flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Save Product & Location"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
