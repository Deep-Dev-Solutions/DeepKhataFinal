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
  X,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  basePrice?: number | null;
  price?: number | null;
  stock: number;
};

type BatchLine = {
  productId: string;
  productName: string;
  branchId?: string | null;
  cabinetId?: string | null;
  quantity: number;
  notes?: string;
  vendorId?: string;
  unitCost?: number;
};

export default function RestockPage() {
  const { user, activeBranchId } = useAuth();
  const readOnly = useIsReadOnly();
  const [products, setProducts] = useState<Product[]>([]);
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Form state for the line being composed
  const [selectedProductId, setSelectedProductId] = useState("");

  const getInitialBranchId = () => {
    if (typeof window !== "undefined") {
      try {
        const storedUser = JSON.parse(localStorage.getItem("user") || "null");
        if (storedUser?.businessId) {
          const stored = localStorage.getItem(`activeBranch_${storedUser.businessId}`);
          if (stored) return stored;
        }
        const generalStored = localStorage.getItem("activeBranchId");
        if (generalStored) return generalStored;
      } catch {}
    }
    return activeBranchId || "";
  };

  const [selectedBranchId, setSelectedBranchId] = useState<string>(getInitialBranchId);
  const [selectedCabinetId, setSelectedCabinetId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
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

  useEffect(() => {
    if (activeBranchId && !selectedBranchId) {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, selectedBranchId]);

  const selectedBranchCabinets = useMemo(() => {
    if (cabinets.length > 0) return cabinets;
    const branch = branches.find((b) => b.id === selectedBranchId);
    return branch?.cabinets || [];
  }, [cabinets, branches, selectedBranchId]);

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/product/getbranches`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.branches)) {
        setBranches(data.branches);
        setSelectedBranchId((prev) => {
          if (prev && data.branches.some((b: Branch) => b.id === prev)) return prev;
          if (activeBranchId && data.branches.some((b: Branch) => b.id === activeBranchId)) return activeBranchId;
          return data.branches[0]?.id || "";
        });
      }
    } catch (err) {
      console.error("Failed to load branches", err);
    }
  }, [activeBranchId]);

  // PART 2: Fetch products using selectedBranchId
  const fetchProducts = useCallback(
    async (branchIdToFetch?: string) => {
      const targetBranch = branchIdToFetch ?? selectedBranchId;
      if (!targetBranch) return;
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeCategory !== "All") params.set("category", activeCategory);
        if (searchQuery) params.set("search", searchQuery);
        params.set("branchId", targetBranch);
        params.set("t", String(Date.now()));

        const res = await fetch(
          `${API_BASE_URL}/product/getproducts?${params.toString()}`,
          {
            credentials: "include",
            headers: getAuthHeaders(targetBranch),
            cache: "no-store",
          },
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      } catch (err) {
        console.error("Failed to load products", err);
      } finally {
        setIsLoading(false);
      }
    },
    [activeCategory, searchQuery, selectedBranchId],
  );

  // PART 2: Fetch cabinets using selectedBranchId
  const fetchCabinets = useCallback(
    async (branchIdToFetch?: string) => {
      const targetBranch = branchIdToFetch ?? selectedBranchId;
      if (!targetBranch) {
        setCabinets([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/product/getcabinets`, {
          credentials: "include",
          headers: getAuthHeaders(targetBranch),
          cache: "no-store",
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.cabinets)) {
          setCabinets(data.cabinets);
        } else {
          const branch = branches.find((b) => b.id === targetBranch);
          setCabinets(branch?.cabinets || []);
        }
      } catch (err) {
        console.error("Failed to load cabinets", err);
        const branch = branches.find((b) => b.id === targetBranch);
        setCabinets(branch?.cabinets || []);
      }
    },
    [selectedBranchId, branches],
  );

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/product/getcategories`, {
        credentials: "include",
        headers: getAuthHeaders(selectedBranchId || activeBranchId),
      });
      const data = await res.json();
      if (data.success)
        setCategories(data.categories.map((c: any) => c.name).sort());
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  }, [selectedBranchId, activeBranchId]);

  const loadVendors = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        credentials: "include",
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
    void loadVendors();
  }, [loadBranches, loadCategories, loadVendors]);

  // PART 2: selectedBranchId in dependency array triggers dynamic re-fetch and loading state
  useEffect(() => {
    if (selectedBranchId) {
      void fetchProducts(selectedBranchId);
      void fetchCabinets(selectedBranchId);
    }
  }, [selectedBranchId, fetchProducts, fetchCabinets]);

  const handleAddToBatch = () => {
    if (!selectedProduct) {
      setErrorMsg("Select a product to add to the batch.");
      return;
    }
    const qty = Math.max(1, Number(quantity) || 1);
    const cost = unitCost ? Number(unitCost) : undefined;
    const line: BatchLine = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      branchId: selectedBranchId || null,
      cabinetId: selectedCabinetId || null,
      quantity: qty,
      notes: notes.trim() || undefined,
      vendorId: selectedVendorId || undefined,
      unitCost: cost,
    };

    setBatch((prev) => [...prev, line]);
    setErrorMsg("");
    setNotes("");
    setUnitCost("");
    setSelectedProductId("");
    setSelectedCabinetId("");
    setSelectedVendorId("");
    setQuantity("1");
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
          branchId: line.branchId || selectedBranchId,
          cabinetId: line.cabinetId,
          quantity: line.quantity,
          notes: line.notes,
          vendorId: line.vendorId,
          unitCost: line.unitCost,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/inventory/restock`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(selectedBranchId),
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

      // PART 3.2: Clear batch array
      setBatch([]);

      // PART 3.2: Clear form inputs
      setSelectedProductId("");
      setSelectedCabinetId("");
      setSelectedVendorId("");
      setQuantity("1");
      setUnitCost("");
      setNotes("");

      // PART 3.3: Re-fetch products and cabinets immediately to update stock counts
      await Promise.all([
        fetchProducts(selectedBranchId),
        fetchCabinets(selectedBranchId),
      ]);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to restock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalUnits = batch.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div data-testid="restock-page" className="mt-1 flex h-[calc(100vh-80px)] flex-col gap-3 overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            aria-label="Back to products"
            title="Back"
            className={buttonVariants({ variant: "secondary", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-title font-semibold text-gray-900">
              <Warehouse className="h-5 w-5 text-brand-700" />
              Restock Hub
              <Badge variant="brand">Batch</Badge>
            </h1>
            <p className="hidden text-caption text-gray-500 sm:block">
              Bulk-load shipments into physical cabinets with full movement
              audit logging.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
            Batch Total
          </p>
          <p className="text-heading font-semibold text-gray-900">
            {totalUnits}
            <span className="ml-1 text-body font-medium text-gray-500">
              units
            </span>
          </p>
        </div>
      </div>

      {successMsg && (
        <div data-testid="restock-success" className="flex items-center justify-between rounded-md border border-success/30 bg-success-bg px-3 py-2 text-body font-medium text-success-fg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span>{successMsg}</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setSuccessMsg("")} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
          <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="mt-0 flex flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        {/* LEFT: Catalog + Line Composer */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          {/* Search + Category */}
          <div className="shrink-0 space-y-2.5 border-b border-border bg-gray-50 p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                data-testid="restock-product-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product to restock..."
                className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-body outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto">
              {["All", ...categories].map((cat) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={activeCategory === cat ? "primary" : "secondary"}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-caption font-medium text-gray-700">
                Select Product *
              </label>
              <Select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="cursor-pointer"
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
              </Select>
            </div>
          </div>

          {/* Composer Card */}
          <div className="shrink-0 space-y-3 border-b border-border bg-card p-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Branch
                </label>
                <Select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setSelectedCabinetId("");
                    setSelectedProductId("");
                  }}
                  className="cursor-pointer"
                >
                  {branches.length === 0 && (
                    <option value="">-- No Branch Available --</option>
                  )}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Cabinet (Spatial Bin)
                </label>
                <Select
                  data-testid="restock-cabinet"
                  value={selectedCabinetId}
                  onChange={(e) => setSelectedCabinetId(e.target.value)}
                  disabled={!selectedBranchId}
                  className="cursor-pointer"
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
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Select Vendor (Optional)
                </label>
                <Select
                  data-testid="restock-vendor"
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="cursor-pointer"
                >
                  <option value="">-- No Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.businessName}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Quantity *
                </label>
                <Input
                  type="number"
                  min="1"
                  data-testid="restock-qty"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="font-semibold"
                />
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Unit Cost (Rs.)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  data-testid="restock-unit-cost"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                  className="font-semibold"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note / invoice no. (optional)"
                className="flex-1"
              />
              <Button
                onClick={handleAddToBatch}
                disabled={!selectedProduct || isSubmitting}
              >
                <Plus className="h-4 w-4" /> Add to Batch
              </Button>
            </div>
          </div>

          {/* Compact catalog of available products */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-body text-gray-500">
                Loading products...
              </div>
            ) : products.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-body text-gray-500">
                <Package className="mb-2 h-8 w-8 text-gray-300" />
                No products match your search.
              </div>
            ) : (
              <div className="space-y-1.5">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-left transition-colors ${
                      selectedProductId === p.id
                        ? "border-brand-500 bg-brand-50"
                        : "border-border bg-card hover:border-brand-300 hover:bg-brand-50/40"
                    }`}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="line-clamp-2 text-body font-semibold leading-tight text-gray-900">
                        {p.name}
                      </span>
                      <span className="truncate font-mono text-caption text-gray-500">
                        {p.sku || "N/A"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="neutral">
                        Rs. {(p.basePrice ?? p.price ?? 0).toLocaleString()}
                      </Badge>
                      <Badge variant={p.stock > 0 ? "success" : "danger"}>
                        {p.stock} left
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Batch Accumulator Table */}
        <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs lg:w-[42rem]">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-gray-50 px-3 py-2">
            <h2 className="flex items-center gap-2 text-body font-semibold text-gray-900">
              <Layers className="h-4 w-4 text-brand-700" /> Restock Batch
              <Badge variant="brand">{batch.length} lines</Badge>
            </h2>
            <Boxes className="h-4 w-4 text-gray-400" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {batch.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 py-10 text-gray-400">
                <Layers className="h-10 w-10 text-gray-200" />
                <p className="text-body font-medium text-gray-600">
                  Batch is empty
                </p>
                <p className="text-caption text-gray-500">
                  Add lines from the product panel to queue a shipment.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product</TableHead>
                    <TableHead>Cabinet</TableHead>
                    <TableHead className="text-center">Unit Cost</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.map((line, index) => (
                    <TableRow key={index} data-testid="restock-item-row">
                      <TableCell>
                        <p className="line-clamp-2 break-words text-body font-semibold leading-tight text-gray-900">
                          {line.productName}
                        </p>
                        {line.notes && (
                          <p className="max-w-44 truncate text-caption text-gray-500">
                            {line.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-caption text-gray-600">
                          <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                          <span className="max-w-28 truncate">
                            {branches
                              .find((b) => b.id === line.branchId)
                              ?.cabinets.find((c) => c.id === line.cabinetId)
                              ?.name || "Default Cabinet"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-body font-medium text-gray-600">
                        {line.unitCost !== undefined
                          ? `Rs. ${line.unitCost}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center text-body font-semibold text-gray-900">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {user?.role !== "STAFF" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeLine(index)}
                            title="Remove line"
                            aria-label="Remove line"
                            className="text-gray-400 hover:bg-danger-bg hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-border bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-body font-medium text-gray-500">
                Total Units
              </span>
              <span className="text-heading font-semibold text-gray-900">
                {totalUnits}
              </span>
            </div>
            <Button
              data-testid="restock-submit"
              onClick={handleConfirmRestock}
              disabled={batch.length === 0 || isSubmitting || readOnly}
              loading={isSubmitting}
              variant={readOnly ? "secondary" : "primary"}
              size="lg"
              className="w-full text-base"
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
            >
              {isSubmitting
                ? "Processing Batch..."
                : readOnly
                  ? "Read-only — Subscription expired"
                  : `Confirm Restock (${totalUnits} units)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
