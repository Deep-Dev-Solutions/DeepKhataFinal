"use client";

import { useEffect, useState } from "react";
import { Archive, Barcode, Layers, Loader2, Lock, MapPin, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth, type Branch } from "@/context/AuthContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

type CabinetOption = {
  id: string;
  name: string;
  location?: string | null;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  branch?: { id: string; name: string } | null;
};

type Vendor = { id: string; businessName: string };

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  categories: string[];
}

const initialForm = {
  name: "",
  sku: "",
  category: "",
  price: "",
  costPrice: "",
  branchId: "",
  cabinetId: "",
  vendorId: "",
  quantity: "1",
};

export default function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
}: AddProductModalProps) {
  const { activeBranchId, branches: authBranches } = useAuth();
  const readOnly = useIsReadOnly();
  const [form, setForm] = useState(initialForm);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cabinets, setCabinets] = useState<CabinetOption[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
      setError("");
      setIsSubmitting(false);
      return;
    }

    setForm((current) => ({
      ...current,
      branchId: current.branchId || activeBranchId || "",
    }));
  }, [isOpen, activeBranchId]);

  useEffect(() => {
    if (!isOpen) return;

    const loadMetadata = async () => {
      try {
        const [branchResponse, cabinetResponse, vendorResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/product/getbranches`, {
              headers: getAuthHeaders(),
            }),
            fetch(`${API_BASE_URL}/product/getcabinets`, {
              headers: getAuthHeaders(),
            }),
            fetch(`${API_BASE_URL}/vendors`, { headers: getAuthHeaders() }),
          ]);
        const branchData = await branchResponse.json();
        const cabinetData = await cabinetResponse.json();
        const vendorData = await vendorResponse.json();

        if (Array.isArray(authBranches) && authBranches.length > 0) {
          setBranches(authBranches);
        } else if (branchData.success && Array.isArray(branchData.branches)) {
          setBranches(branchData.branches);
        }
        if (cabinetData.success && Array.isArray(cabinetData.cabinets)) {
          setCabinets(cabinetData.cabinets);
        }
        if (vendorData.success && Array.isArray(vendorData.vendors)) {
          setVendors(vendorData.vendors);
        }
      } catch {
        setError("Failed to load branches, cabinets, or vendors.");
      }
    };

    void loadMetadata();
  }, [isOpen, authBranches]);

  if (!isOpen) return null;

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const selectedBranchCabinets = form.branchId
    ? cabinets.filter((cabinet) => cabinet.branch?.id === form.branchId)
    : [];

  const cabinetLabel = (cabinet: CabinetOption) => {
    const parts = [
      cabinet.rack ? `Rack ${cabinet.rack}` : null,
      cabinet.shelf ? `Shelf ${cabinet.shelf}` : null,
      cabinet.bin ? `Bin ${cabinet.bin}` : null,
    ].filter(Boolean);
    return `${cabinet.name} - ${parts.join(" / ") || cabinet.location || "General"}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.price || !form.category || !form.branchId) {
      setError("Fill in the required fields and select a branch.");
      return;
    }
    if (!form.cabinetId) {
      setError("Select an existing cabinet for this product stock.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/addproduct`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim() || `PART-${Math.floor(1000 + Math.random() * 9000)}`,
          category: form.category,
          price: Number(form.price),
          defaultCostPrice: form.costPrice ? Number(form.costPrice) : undefined,
          branchId: form.branchId,
          cabinetId: form.cabinetId,
          quantity: Math.max(1, Number(form.quantity) || 1),
          vendorId: form.vendorId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to add product");
      }

      await onSuccess();
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to add product",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 p-5 backdrop-blur">
          <div>
            <h2 id="add-product-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Archive className="h-5 w-5 text-blue-600" /> Add Product
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Add a catalog item and place its physical stock in an existing cabinet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close add product dialog"
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Product / Part Name *</label>
              <input required autoFocus value={form.name} onChange={(event) => updateField("name", event.target.value)} className={inputClass} placeholder="e.g. iPhone 13 OLED Display" />
            </div>
            <div>
              <label className={labelClass}>Category *</label>
              <select required value={form.category} onChange={(event) => updateField("category", event.target.value)} className={`${inputClass} cursor-pointer`}>
                <option value="" disabled>Select category...</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>SKU / Part Serial</label>
              <div className="relative">
                <Barcode className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} className={`${inputClass} pl-9 font-mono`} placeholder="Auto-generated if empty" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Selling Price (Rs) *</label>
              <input type="number" min="0" required value={form.price} onChange={(event) => updateField("price", event.target.value)} className={inputClass} placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>Cost Price (Rs)</label>
              <input type="number" min="0" value={form.costPrice} onChange={(event) => updateField("costPrice", event.target.value)} className={inputClass} placeholder="Optional" />
            </div>
            <div>
              <label className={labelClass}>Physical Instances *</label>
              <input type="number" min="1" required value={form.quantity} onChange={(event) => updateField("quantity", event.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-5">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <MapPin className="h-3.5 w-3.5 text-indigo-500" /> Physical Stock Location
            </h3>
            <div>
              <label className={labelClass}>Branch (for physical stock) *</label>
              <select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value, cabinetId: "" }))} className={`${inputClass} cursor-pointer`}>
                <option value="" disabled>Select a branch...</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                <Layers className="h-3 w-3" /> The master product is global; physical units are placed in this branch.
              </p>
            </div>
            <div>
              <label className={labelClass}>Existing Rack / Shelf / Bin (from Cabinets) *</label>
              <select required value={form.cabinetId} onChange={(event) => updateField("cabinetId", event.target.value)} className={`${inputClass} cursor-pointer`}>
                <option value="">{selectedBranchCabinets.length ? "Choose an existing cabinet..." : "No cabinets in this branch"}</option>
                {selectedBranchCabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinetLabel(cabinet)}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] text-slate-400">Create cabinets first from Settings &gt; Cabinets.</p>
            </div>
            <div>
              <label className={labelClass}>Select Vendor (Optional)</label>
              <select value={form.vendorId} onChange={(event) => updateField("vendorId", event.target.value)} className={`${inputClass} cursor-pointer`}>
                <option value="">No Vendor</option>
                {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.businessName}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || readOnly} className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 disabled:opacity-50 ${readOnly ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : readOnly ? <Lock className="h-4 w-4" /> : null}
              {isSubmitting ? "Creating..." : readOnly ? "Read-only" : "Create Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
