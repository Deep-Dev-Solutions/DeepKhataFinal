"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import TagInput from "@/components/ui/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

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

const labelClass = "mb-1 block text-caption font-medium text-gray-700";

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
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
      size="lg"
      data-testid="edit-product-modal"
      title={
        <span className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-brand-700" /> Edit Product
        </span>
      }
      description="Update pricing, part numbers, aliases and stock thresholds."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            data-testid="edit-product-error"
            className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Product / Part Name *</label>
            <Input
              data-testid="edit-product-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>SKU / Part Serial</label>
            <Input
              data-testid="edit-product-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <label className={labelClass}>Selling Price (Rs) *</label>
            <Input
              data-testid="edit-product-price"
              type="number"
              min="0"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          {canSeeCost && (
            <div>
              <label className={labelClass}>Cost Price (Rs)</label>
              <Input
                data-testid="edit-product-cost"
                type="number"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Part Number</label>
            <Input
              data-testid="product-part-number"
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              className="font-mono"
              placeholder="Manufacturer part number"
            />
          </div>
          <div>
            <label className={labelClass}>Minimum Sale Price (Rs)</label>
            <Input
              data-testid="product-min-price"
              type="number"
              min="0"
              value={minSalePrice}
              onChange={(e) => setMinSalePrice(e.target.value)}
              placeholder="Empty clears the floor price"
            />
          </div>
          <div>
            <label className={labelClass}>Low Stock Threshold</label>
            <Input
              data-testid="product-low-stock"
              type="number"
              min="0"
              step="1"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
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

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="edit-product-submit"
            loading={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
