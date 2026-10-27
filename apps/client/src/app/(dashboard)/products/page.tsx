"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Package,
  AlertCircle,
  CheckCircle2,
  Filter,
  Plus,
  Trash2,
  FolderTree,
  Tag,
  Barcode,
  Loader2,
  AlertTriangle,
  X,
  MapPin,
  Eye,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { useAuth } from "@/context/AuthContext";
import AddProductModal from "@/components/modals/AddProductModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatPrice = (val: any): string => {
  const num = Number(val);
  return (isNaN(num) ? 0 : num).toLocaleString();
};

type StockFilter = "all" | "low" | "out";

type ProductRecord = {
  id: string;
  name: string;
  sku: string;
  basePrice?: number;
  price?: number;
  stock: number;
  hasDeletedBranchStock?: boolean;
  category?: {
    name?: string | null;
  } | null;
  instances?: Array<{
    id: string;
    status: string;
    cabinet?: {
      name?: string | null;
      location?: string | null;
    } | null;
  }>;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  location: string;
  hasDeletedBranchStock: boolean;
};

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

const normalizeProduct = (product: ProductRecord): ProductRow => {
  const instances = product.instances || [];
  const primaryCabinet = instances[0]?.cabinet;
  const location =
    primaryCabinet?.location || primaryCabinet?.name || "Cabinet (Shop Bin)";

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category?.name ?? "Uncategorized",
    price: Number(product.basePrice ?? product.price ?? 0),
    stock: Number(product.stock ?? 0),
    location,
    hasDeletedBranchStock: Boolean(product.hasDeletedBranchStock),
  };
};

function ProductsPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const readOnly = useIsReadOnly();
  const { activeBranchId } = useAuth();

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [activeCategory, setActiveCategory] = useState(
    searchParams.get("category") || "All",
  );
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    (searchParams.get("stock") as StockFilter) || "all",
  );
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Debounce search query to prevent spamming the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchCategories = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/product/getcategories`, {
        credentials: "include",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await response.json();
      if (data.success) {
        const names = data.categories.map((c: any) => c.name);
        setCategories(names.sort());
      }
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  }, [activeBranchId]);

  const refreshProducts = useCallback(async () => {
    if (!activeBranchId) {
      setIsLoadingProducts(false);
      return;
    }
    setIsLoadingProducts(true);
    setPageError("");

    try {
      const params = new URLSearchParams();

      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      if (activeCategory !== "All") params.set("category", activeCategory);
      if (stockFilter !== "all") params.set("stock", stockFilter);

      const response = await fetch(
        `${API_BASE_URL}/product/getproducts?${params.toString()}`,
        {
          credentials: "include",
          headers: getAuthHeaders(activeBranchId),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to load products",
        );
      }

      const normalizedProducts = (
        (data?.products || []) as ProductRecord[]
      ).map(normalizeProduct);
      setProducts(normalizedProducts);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load products",
      );
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [debouncedSearchQuery, activeCategory, stockFilter, activeBranchId]);

  // Synchronize search query and filter with URL params
  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
    if (activeCategory !== "All") params.set("category", activeCategory);
    if (stockFilter !== "all") params.set("stock", stockFilter);

    const currentQuery = searchParams.toString();
    const newQuery = params.toString();

    if (currentQuery !== newQuery) {
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [
    debouncedSearchQuery,
    activeCategory,
    stockFilter,
    pathname,
    searchParams,
  ]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  const handleDeleteProduct = async (id: string) => {
    setIsDeleting(true);
    setPageError("");
    setActionMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/${id}`, {
        credentials: "include",
        method: "DELETE",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to delete product",
        );
      }
      setDeleteTarget(null);
      setActionMsg(data?.message || "Product deleted.");
      await refreshProducts();
    } catch (error) {
      setDeleteTarget(null);
      setPageError(
        error instanceof Error ? error.message : "Failed to delete product",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveStock = async (productId: string, productName: string) => {
    setMovingId(productId);
    setPageError("");
    setActionMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/move-stock`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({ productId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to move stock");
      }
      setActionMsg(
        `"${productName}" — ${data?.message || "Stock moved to the active branch."}`,
      );
      await refreshProducts();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to move stock",
      );
    } finally {
      setMovingId(null);
    }
  };

  // --- MATH & FILTERS ---
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      activeCategory === "All" || p.category === activeCategory;
    const matchesStock =
      stockFilter === "all"
        ? true
        : stockFilter === "low"
          ? p.stock > 0 && p.stock <= 5
          : p.stock === 0;

    return matchesSearch && matchesCat && matchesStock;
  });

  const totalInventoryValue = filteredProducts.reduce(
    (sum, p) => sum + p.price * p.stock,
    0,
  );
  const lowStockCount = filteredProducts.filter(
    (p) => p.stock > 0 && p.stock <= 5,
  ).length;
  const outOfStockCount = filteredProducts.filter((p) => p.stock === 0).length;

  return (
    <div
      data-testid="products-page"
      className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300"
    >
      {/* 1. PAGE HEADER & ADD BUTTON */}
      <PageHeader
        title="Products & Inventory"
        subtitle="Manage catalog, categories, and track inventory value."
        actions={
          hasPermission("write:products") ? (
            <div className="flex items-center gap-2">
              {readOnly ? (
                <span
                  title="Subscription expired. System is in read-only mode."
                  className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md bg-gray-100 px-3 text-body font-medium text-gray-500"
                >
                  <Lock className="w-4 h-4" /> Read-only
                </span>
              ) : (
                <Button
                  type="button"
                  data-testid="products-add"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Plus className="w-4 h-4" /> Add Product
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {/* 2. DYNAMIC METRICS CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
              Products in View
            </p>
            <p className="text-title font-semibold text-gray-900">
              {filteredProducts.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
              Inventory Value
            </p>
            <p className="text-title font-semibold text-success">
              Rs. {totalInventoryValue.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Needs Restock
              </p>
              <p className="text-title font-semibold text-danger">
                {lowStockCount + outOfStockCount} items
              </p>
            </div>
            <AlertCircle className="h-5 w-5 text-danger" />
          </CardContent>
        </Card>
      </div>

      {/* 3. CATEGORY TABS & SEARCH BAR */}
      <Card>
        <CardContent className="space-y-3 px-4 py-3">
          {/* Category Filter Pills */}
          <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-border pb-2">
            <FolderTree className="mr-1 h-4 w-4 shrink-0 text-gray-400" />
            <Button
              size="sm"
              variant={activeCategory === "All" ? "primary" : "secondary"}
              onClick={() => setActiveCategory("All")}
            >
              All Categories
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={activeCategory === category ? "primary" : "secondary"}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex flex-col gap-2 pt-1 sm:flex-row">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <Input
                type="text"
                data-testid="products-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name or SKU barcode..."
                className="pl-9"
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className="w-full sm:w-auto"
            >
              <Filter className="w-4 h-4" />{" "}
              {stockFilter === "all" ? "More Filters" : "Filters Active"}
            </Button>

            {/* Filter Dropdown */}
            {isFilterMenuOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 absolute right-0 top-12 z-20 w-56 rounded-md border border-border bg-card p-2 shadow-md">
                <p className="mb-1 px-2 text-caption font-semibold uppercase tracking-wide text-gray-500">
                  Stock Level
                </p>
                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      setStockFilter("all");
                      setIsFilterMenuOpen(false);
                    }}
                    className={`w-full rounded px-2 py-1.5 text-left text-body font-medium ${
                      stockFilter === "all"
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    All Products
                  </button>
                  <button
                    onClick={() => {
                      setStockFilter("low");
                      setIsFilterMenuOpen(false);
                    }}
                    className={`w-full rounded px-2 py-1.5 text-left text-body font-medium ${
                      stockFilter === "low"
                        ? "bg-warning-bg text-warning-fg"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Low Stock (1-5)
                  </button>
                  <button
                    onClick={() => {
                      setStockFilter("out");
                      setIsFilterMenuOpen(false);
                    }}
                    className={`w-full rounded px-2 py-1.5 text-left text-body font-medium ${
                      stockFilter === "out"
                        ? "bg-danger-bg text-danger-fg"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Out of Stock (0)
                  </button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. INVENTORY TABLE */}
      <Card className="flex-1 overflow-hidden">
        {pageError && (
          <div className="border-b border-border bg-danger-bg px-4 py-2 text-body text-danger-fg">
            {pageError}
          </div>
        )}
        {actionMsg && (
          <div className="flex items-center gap-2 border-b border-border bg-success-bg px-4 py-2 text-body text-success-fg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {actionMsg}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Product & Category</TableHead>
              <TableHead className="w-36">Price (Rs)</TableHead>
              <TableHead className="w-56">Spatial Location (Cabinet)</TableHead>
              <TableHead className="w-40">Available Stock</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingProducts ? (
              <TableEmpty colSpan={5}>
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading products
                  from the server...
                </span>
              </TableEmpty>
            ) : filteredProducts.length === 0 ? (
              <TableEmpty colSpan={5}>
                <EmptyState
                  className="border-0 bg-transparent py-6 shadow-none"
                  icon={Package}
                  title="No products found"
                  description="No products match the current filters."
                />
              </TableEmpty>
            ) : (
              filteredProducts.map((product) => (
                <TableRow data-testid="product-row" key={product.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        href={`/products/${product.id}`}
                        className="font-semibold text-gray-900 transition-colors hover:text-brand-700 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="neutral">
                          <Tag className="w-3 h-3" /> {product.category}
                        </Badge>
                        <span className="inline-flex items-center gap-1 font-mono text-caption text-gray-400">
                          <Barcode className="w-3 h-3" /> {product.sku}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="font-semibold text-gray-700">
                    Rs. {formatPrice(product.price)}
                  </TableCell>

                  <TableCell>
                    <span
                      title={product.location}
                      className="flex w-fit max-w-44 items-center gap-1 rounded border border-border bg-gray-50 px-1.5 h-[18px] text-caption font-medium text-gray-700"
                    >
                      <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
                      <span className="truncate">{product.location}</span>
                    </span>
                    {product.hasDeletedBranchStock && (
                      <Badge variant="warning" className="mt-1">
                        <AlertCircle className="w-3 h-3" />
                        Stock from a deleted branch
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    <span data-testid="product-row-stock">
                      <Badge
                        variant={
                          product.stock > 3
                            ? "success"
                            : product.stock > 0
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {product.stock > 0
                          ? `${product.stock} units available`
                          : "Out of Stock"}
                      </Badge>
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Link
                        href={`/products/${product.id}`}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-700"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {hasPermission("write:products") &&
                        product.hasDeletedBranchStock && (
                          <button
                            onClick={() =>
                              void handleMoveStock(product.id, product.name)
                            }
                            disabled={movingId === product.id || readOnly}
                            title={
                              readOnly
                                ? "Subscription expired. System is in read-only mode."
                                : "Move stock from deleted branch to the active branch"
                            }
                            className={`rounded p-1.5 transition-colors disabled:opacity-50 ${
                              readOnly
                                ? "cursor-not-allowed bg-gray-50 text-gray-300"
                                : "text-warning-fg hover:bg-warning-bg"
                            }`}
                          >
                            {movingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <MapPin className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      {hasPermission("delete:products") && (
                        <button
                          onClick={() => setDeleteTarget(product)}
                          className="rounded p-1.5 text-gray-300 transition-colors hover:bg-danger-bg hover:text-danger"
                          title="Delete product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ==========================================
          🟢 RENDER MODALS HERE
      ========================================== */}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this product?"
        description={
          <>
            <span className="font-semibold text-gray-900">
              &quot;{deleteTarget?.name}&quot;
            </span>{" "}
            will be deleted from the master catalog. It will no longer be
            visible, sellable, or restockable in any branch, though its sales
            and movement history is preserved for reports. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete Product"
        loading={isDeleting}
        onConfirm={() => {
          const target = deleteTarget;
          if (target) {
            void handleDeleteProduct(target.id);
          }
        }}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />

      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={refreshProducts}
        categories={categories}
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-body text-gray-500">
          Loading products...
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
