"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import TagInput from "@/components/ui/TagInput";

export type EditableProduct = {
  id: string;
  name: string;
  sku?: string | null;
  basePrice?: number | string | null;
  defaultCostPrice?: number | string | null;
  partNumber?: string | null;
  aliases?: string[] | null;
  compatibleWith?: string[] | null;
  minSalePrice?: number | string | null;
  lowStockThreshold?: number | string | null;
};

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: EditableProduct;
  onSaved: () => void | Promise<void>;
}

const str = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

export default function EditProductModal({
  isOpen,
  onClose,
  product,
  onSaved,
}: EditProductModalProps) {
  const { toast } = useToast();
  const { role } = usePermissions();
  const canSeeCost = role === "OWNER" || role === "MANAGER";

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [compatibleWith, setCompatibleWith] = useState<string[]>([]);
  const [minSalePrice, setMinSalePrice] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(product.name || "");
    setSku(product.sku || "");
    setPrice(str(product.basePrice));
    setCostPrice(str(product.defaultCostPrice));
    setPartNumber(product.partNumber || "");
    setAliases(Array.isArray(product.aliases) ? product.aliases : []);
    setCompatibleWith(
      Array.isArray(product.compatibleWith) ? product.compatibleWith : [],
    );
    setMinSalePrice(str(product.minSalePrice));
    setLowStockThreshold(str(product.lowStockThreshold));
    setError("");
    setIsSubmitting(false);
  }, [isOpen, product]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || price === "" || Number(price) < 0) {
      setError("Name and a valid sale price are required.");
      return;
    }
    if (minSalePrice !== "" && Number(minSalePrice) > Number(price)) {
      setError("Minimum price cannot be above the sale price");
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      basePrice: Number(price),
      partNumber: partNumber.trim(),
      aliases,
      compatibleWith,
      minSalePrice: minSalePrice === "" ? null : Number(minSalePrice),
      lowStockThreshold:
        lowStockThreshold === "" ? null : Number(lowStockThreshold),
    };
    if (canSeeCost && costPrice !== "") {
      body.defaultCostPrice = Number(costPrice);
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/${product.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message || data?.error || "Failed to update product";
        throw new Error(message);
      }
      toast.success("Product updated");
      await onSaved();
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to update product",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="edit-product-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 p-5 backdrop-blur">
          <h2
            id="edit-product-title"
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <Pencil className="h-5 w-5 text-blue-600" /> Edit Product
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close edit product dialog"
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error && (
            <div
              data-testid="edit-product-error"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Product / Part Name *</label>
              <input
                data-testid="edit-product-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>SKU / Part Serial</label>
              <input
                data-testid="edit-product-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Selling Price (Rs) *</label>
              <input
                data-testid="edit-product-price"
                type="number"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </div>
            {canSeeCost && (
              <div>
                <label className={labelClass}>Cost Price (Rs)</label>
                <input
                  data-testid="edit-product-cost"
                  type="number"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Part Number</label>
              <input
                data-testid="product-part-number"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="Manufacturer part number"
              />
            </div>
            <div>
              <label className={labelClass}>Minimum Sale Price (Rs)</label>
              <input
                data-testid="product-min-price"
                type="number"
                min="0"
                value={minSalePrice}
                onChange={(e) => setMinSalePrice(e.target.value)}
                className={inputClass}
                placeholder="Empty clears the floor price"
              />
            </div>
            <div>
              <label className={labelClass}>Low Stock Threshold</label>
              <input
                data-testid="product-low-stock"
                type="number"
                min="0"
                step="1"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Aliases / Shop Names</label>
              <TagInput
                testId="product-aliases"
                value={aliases}
                onChange={setAliases}
                placeholder="Type a name and press Enter"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Compatible Models</label>
              <TagInput
                testId="product-compatible"
                value={compatibleWith}
                onChange={setCompatibleWith}
                placeholder="e.g. iPhone 13, iPhone 13 Pro"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="edit-product-submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
