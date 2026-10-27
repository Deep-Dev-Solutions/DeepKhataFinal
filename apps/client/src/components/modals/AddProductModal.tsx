"use client";

import { useEffect, useState } from "react";
import { Archive, Barcode, Layers, Lock, MapPin } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth, type Branch } from "@/context/AuthContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import TagInput from "@/components/ui/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

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
  partNumber: "",
  minSalePrice: "",
  lowStockThreshold: "",
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
  const [aliases, setAliases] = useState<string[]>([]);
  const [compatibleWith, setCompatibleWith] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
      setAliases([]);
      setCompatibleWith([]);
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
              credentials: "include",
              headers: getAuthHeaders(),
            }),
            fetch(`${API_BASE_URL}/product/getcabinets`, {
              credentials: "include",
              headers: getAuthHeaders(),
            }),
            fetch(`${API_BASE_URL}/vendors`, { credentials: "include",  headers: getAuthHeaders() }),
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
    if (form.minSalePrice && Number(form.minSalePrice) > Number(form.price)) {
      setError("Minimum price cannot be above the sale price");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/addproduct`, {
        credentials: "include",
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
          partNumber: form.partNumber.trim() || undefined,
          aliases: aliases.length ? aliases : undefined,
          compatibleWith: compatibleWith.length ? compatibleWith : undefined,
          minSalePrice: form.minSalePrice ? Number(form.minSalePrice) : undefined,
          lowStockThreshold: form.lowStockThreshold
            ? Number(form.lowStockThreshold)
            : undefined,
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

  const labelClass = "mb-1 block text-caption font-medium text-gray-700";
  const hintClass = "mt-1 flex items-center gap-1 text-caption text-gray-500";

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
      size="lg"
      data-testid="add-product-modal"
      title={
        <span className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-brand-700" /> Add Product
        </span>
      }
      description="Add a catalog item and place its physical stock in an existing cabinet."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Product / Part Name *</label>
            <Input required autoFocus value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="e.g. iPhone 13 OLED Display" />
          </div>
          <div>
            <label className={labelClass}>Category *</label>
            <Select required value={form.category} onChange={(event) => updateField("category", event.target.value)} className="cursor-pointer">
              <option value="" disabled>Select category...</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelClass}>SKU / Part Serial</label>
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} className="pl-9 font-mono" placeholder="Auto-generated if empty" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Selling Price (Rs) *</label>
            <Input type="number" min="0" required value={form.price} onChange={(event) => updateField("price", event.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={labelClass}>Cost Price (Rs)</label>
            <Input type="number" min="0" value={form.costPrice} onChange={(event) => updateField("costPrice", event.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className={labelClass}>Physical Instances *</label>
            <Input type="number" min="1" required value={form.quantity} onChange={(event) => updateField("quantity", event.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Part Number</label>
            <Input data-testid="product-part-number" value={form.partNumber} onChange={(event) => updateField("partNumber", event.target.value)} className="font-mono" placeholder="Manufacturer part number" />
          </div>
          <div>
            <label className={labelClass}>Minimum Sale Price (Rs)</label>
            <Input data-testid="product-min-price" type="number" min="0" value={form.minSalePrice} onChange={(event) => updateField("minSalePrice", event.target.value)} placeholder="Floor price (optional)" />
          </div>
          <div>
            <label className={labelClass}>Low Stock Threshold</label>
            <Input data-testid="product-low-stock" type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(event) => updateField("lowStockThreshold", event.target.value)} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Aliases / Shop Names</label>
            <TagInput testId="product-aliases" value={aliases} onChange={setAliases} placeholder="Type a name and press Enter" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Compatible Models</label>
            <TagInput testId="product-compatible" value={compatibleWith} onChange={setCompatibleWith} placeholder="e.g. iPhone 13, iPhone 13 Pro" />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-gray-500">
            <MapPin className="h-3.5 w-3.5 text-brand-700" /> Physical Stock Location
          </h3>
          <div>
            <label className={labelClass}>Branch (for physical stock) *</label>
            <Select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value, cabinetId: "" }))} className="cursor-pointer">
              <option value="" disabled>Select a branch...</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
            <p className={hintClass}>
              <Layers className="h-3 w-3" /> The master product is global; physical units are placed in this branch.
            </p>
          </div>
          <div>
            <label className={labelClass}>Existing Rack / Shelf / Bin (from Cabinets) *</label>
            <Select required value={form.cabinetId} onChange={(event) => updateField("cabinetId", event.target.value)} className="cursor-pointer">
              <option value="">{selectedBranchCabinets.length ? "Choose an existing cabinet..." : "No cabinets in this branch"}</option>
              {selectedBranchCabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinetLabel(cabinet)}</option>)}
            </Select>
            <p className={hintClass}>Create cabinets first from Settings &gt; Cabinets.</p>
          </div>
          <div>
            <label className={labelClass}>Select Vendor (Optional)</label>
            <Select value={form.vendorId} onChange={(event) => updateField("vendorId", event.target.value)} className="cursor-pointer">
              <option value="">No Vendor</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.businessName}</option>)}
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={readOnly} variant={readOnly ? "secondary" : "primary"}>
            {readOnly ? <Lock className="h-4 w-4" /> : null}
            {isSubmitting ? "Creating..." : readOnly ? "Read-only" : "Create Product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
