"use client";

import { useState, useEffect } from "react";
import { X, Barcode, Layers, Archive, Tag, Check, MapPin, Lock } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

export type ItemConditionType =
  | "ORIGINAL_PULL"
  | "COPY"
  | "MINOR_SCRATCHES"
  | "WORKING"
  | "DEAD_DONOR";

export type ProductFormValues = {
  name: string;
  sku: string;
  category: string;
  price: number;
  // Spatial Inventory
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

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (product: ProductFormValues) => void | Promise<void>;
  categories: string[];
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
];

export default function AddProductModal({
  isOpen,
  onClose,
  onAdd,
  categories,
}: AddProductModalProps) {
  const readOnly = useIsReadOnly();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");

  // Spatial Inventory States
  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState("");
  const [rack, setRack] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [condition, setCondition] =
    useState<ItemConditionType>("ORIGINAL_PULL");
  const [quantity, setQuantity] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available cabinets
  useEffect(() => {
    if (!isOpen) return;

    const fetchCabinets = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`${API_BASE_URL}/product/getcabinets`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.cabinets)) {
          setCabinets(data.cabinets);
        }
      } catch (err) {
        console.error("Failed to load cabinets:", err);
      }
    };

    void fetchCabinets();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !category) return;

    setIsSubmitting(true);
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

      await onAdd(payload);

      // Reset form
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Archive className="w-5 h-5 text-blue-600" />
              Add Product & Spatial Instance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Map physical spare part to physical rack location and inspect item
              condition.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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

          {/* Section 2: Spatial Inventory Location (Rack, Shelf, Bin) */}
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
                  onChange={(e) => {
                    setSelectedCabinetId(e.target.value);
                  }}
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

            <div>
              <label
                htmlFor="condition-select"
                className="block text-xs font-semibold text-slate-600 mb-1.5"
              >
                Condition Select Dropdown
              </label>
              <select
                id="condition-select"
                name="condition"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as ItemConditionType)
                }
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value} ({opt.label})
                  </option>
                ))}
              </select>
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
                Generates {Number(quantity) || 1} distinct physical{" "}
                <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">
                  ProductInstance
                </code>{" "}
                records linked to this cabinet.
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`px-6 py-2.5 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-200 disabled:opacity-50 flex items-center gap-2 ${
                readOnly
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                "Creating Instances..."
              ) : readOnly ? (
                <>
                  <Lock className="w-4 h-4" /> Read-only
                </>
              ) : (
                "Save Product & Location"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
