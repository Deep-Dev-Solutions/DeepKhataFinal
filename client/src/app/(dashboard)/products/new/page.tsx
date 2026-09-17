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
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

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
  rack: string;
  shelf: string;
  bin: string;
  cabinetId?: string;
  condition: ItemConditionType;
  quantity: number;
};

interface CabinetOption {
  id: string;
  name: string;
  location?: string | null;
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

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState("");
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
    const loadMeta = async () => {
      try {
        const [catRes, cabRes] = await Promise.all([
          fetch(`${API_BASE_URL}/product/getcategories`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE_URL}/product/getcabinets`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const catData = await catRes.json();
        const cabData = await cabRes.json();

        if (catData.success && Array.isArray(catData.categories)) {
          setCategories(catData.categories.map((c: any) => c.name));
        }
        if (cabData.success && Array.isArray(cabData.cabinets)) {
          setCabinets(cabData.cabinets);
        }
      } catch (err) {
        console.error("Failed to load categories/cabinets:", err);
      }
    };
    void loadMeta();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !category) return;

    setIsSubmitting(true);
    setPageError("");
    setSuccessMsg("");

    try {
      const payload: ProductFormValues = {
        name: name.trim(),
        sku: sku.trim() || `PART-${Math.floor(1000 + Math.random() * 9000)}`,
        category,
        price: Number(price),
        rack: rack.trim(),
        shelf: shelf.trim(),
        bin: bin.trim(),
        cabinetId: selectedCabinetId || undefined,
        condition,
        quantity: Math.max(1, Number(quantity) || 1),
      };

      const response = await fetch(`${API_BASE_URL}/product/addproduct`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to add product");
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

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-500 pb-12 mt-2 font-sans">
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
            Add Product & Spatial Instance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Map physical spare part to a rack location and profile its
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

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
      >
        {/* Section 1: Item Basic Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Basic Part Specification
          </h3>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Product / Part Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. iPhone 13 Pro Max OLED Display"
              className="w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Category *
              </label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
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
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Selling Price (Rs) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              SKU / Part Serial
            </label>
            <div className="relative">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. DSP-IP13PM-001"
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Section 2: Spatial Inventory Location */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              Spatial Inventory (Physical Location)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              Hafeez Centre Physical Mapping
            </span>
          </div>

          {cabinets.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Assign to Existing Cabinet (Optional)
              </label>
              <select
                value={selectedCabinetId}
                onChange={(e) => setSelectedCabinetId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white cursor-pointer"
              >
                <option value="">
                  -- Or enter new Rack / Shelf / Bin below --
                </option>
                {cabinets.map((cab) => (
                  <option key={cab.id} value={cab.id}>
                    {cab.name} ({cab.location || "General"})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Prefer creating a structured cabinet instead? Use
                <Link
                  href="/settings/cabinets"
                  className="text-indigo-600 font-semibold hover:underline ml-1"
                >
                  Settings &rarr; Cabinets
                </Link>
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rack
              </label>
              <input
                type="text"
                value={rack}
                onChange={(e) => setRack(e.target.value)}
                placeholder="e.g. Rack A"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Shelf
              </label>
              <input
                type="text"
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                placeholder="e.g. Shelf 2"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bin
              </label>
              <input
                type="text"
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                placeholder="e.g. Bin 04"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Section 3: Item Condition Profiling */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-500" />
              Item Condition Profiling *
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CONDITION_OPTIONS.map((opt) => {
              const isSelected = condition === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setCondition(opt.value)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-slate-900">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-blue-600 font-bold" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 4: Discrete Physical Quantity */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Number of Physical Instances to Deposit *
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-32 border border-slate-300 rounded-xl py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-xs text-slate-500 font-medium">
              Generates {Number(quantity) || 1} distinct physical
              <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono ml-1">
                ProductInstance
              </code>{" "}
              records linked to this cabinet.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
          <Link
            href="/products"
            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting
              ? "Creating Instances..."
              : "Save Product & Location"}
          </button>
        </div>
      </form>
    </div>
  );
}