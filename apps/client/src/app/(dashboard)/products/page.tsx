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
} from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import AddProductModal from "@/components/modals/AddProductModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";

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
    condition: string;
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
  conditions: string[];
  hasDeletedBranchStock: boolean;
};

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

const normalizeProduct = (product: ProductRecord): ProductRow => {
  const instances = product.instances || [];
  const primaryCabinet = instances[0]?.cabinet;
  const location =
    primaryCabinet?.location || primaryCabinet?.name || "Cabinet (Shop Bin)";
  const uniqueConditions = Array.from(
    new Set(instances.map((i) => i.condition).filter(Boolean)),
  );

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category?.name ?? "Uncategorized",
    price: Number(product.basePrice ?? product.price ?? 0),
    stock: Number(product.stock ?? 0),
    location,
    conditions: uniqueConditions.length ? uniqueConditions : ["ORIGINAL_PULL"],
    hasDeletedBranchStock: Boolean(product.hasDeletedBranchStock),
  };
};

function ProductsPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();

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

  // 🟢 STATES
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");

  // Debounce search query to prevent spamming the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/product/getcategories`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        const names = data.categories.map((c: any) => c.name);
        setCategories(names.sort());
      }
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  }, []);

  const refreshProducts = useCallback(async () => {
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
          headers: getAuthHeaders(),
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
  }, [debouncedSearchQuery, activeCategory, stockFilter]);

  const handleAddCategory = async () => {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) return;

    const response = await fetch(`${API_BASE_URL}/product/addcategory`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: trimmedName }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || data?.error || "Failed to add category");
    }

    await fetchCategories();
    setIsCategoryModalOpen(false);
    setNewCategoryName("");
  };

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
        method: "DELETE",
        headers: getAuthHeaders(),
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
        method: "POST",
        headers: getAuthHeaders(),
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
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 mt-2">
      {/* 🟢 1. PAGE HEADER & ADD BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Products & Inventory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage catalog, categories, and track inventory value.
          </p>
        </div>

        {hasPermission("write:products") && (
          <div className="flex items-center gap-2">
            <Link
              href="/products/new"
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
            >
              <Plus className="w-4 h-4" /> Add Product
            </Link>
          </div>
        )}
      </div>

      {/* 🟢 2. DYNAMIC METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* ... (Metrics code stays exactly the same) ... */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Products in View
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {filteredProducts.length}
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Inventory Value
            </p>
            <p className="text-2xl font-bold text-slate-900 text-emerald-600">
              Rs. {totalInventoryValue.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600">Needs Restock</p>
            <p className="text-2xl font-bold text-rose-700">
              {lowStockCount + outOfStockCount} items
            </p>
          </div>
          <AlertCircle className="w-8 h-8 text-rose-200" />
        </div>
      </div>

      {/* 🟢 3. CATEGORY TABS & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2 sm:pb-0 border-b border-slate-100">
          <FolderTree className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <button
            onClick={() => setActiveCategory("All")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${activeCategory === "All" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All Categories
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === category ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {category}
            </button>
          ))}
          {hasPermission("write:products") && (
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 whitespace-nowrap transition-colors flex items-center gap-1 ml-auto"
            >
              <Plus className="w-3.5 h-3.5" /> New Category
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4 pt-2 relative">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name or SKU barcode..."
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
            />
          </div>

          <button
            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
            className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors w-full sm:w-auto ${isFilterMenuOpen || stockFilter !== "all" ? "bg-blue-50 border-blue-200 text-blue-700" : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"}`}
          >
            <Filter className="w-4 h-4" />{" "}
            {stockFilter === "all" ? "More Filters" : "Filters Active"}
          </button>

          {/* Filter Dropdown */}
          {isFilterMenuOpen && (
            <div className="absolute right-0 top-14 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-20 animate-in fade-in slide-in-from-top-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Stock Level
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setStockFilter("all");
                    setIsFilterMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${stockFilter === "all" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  All Products
                </button>
                <button
                  onClick={() => {
                    setStockFilter("low");
                    setIsFilterMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${stockFilter === "low" ? "bg-yellow-50 text-yellow-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Low Stock (1-5)
                </button>
                <button
                  onClick={() => {
                    setStockFilter("out");
                    setIsFilterMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${stockFilter === "out" ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  Out of Stock (0)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🟢 4. INVENTORY TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1">
        {pageError && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        )}
        {actionMsg && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {actionMsg}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Product & Category</th>
                <th className="px-6 py-4 font-semibold w-36">Price (Rs)</th>
                <th className="px-6 py-4 font-semibold w-56">
                  Spatial Location (Cabinet)
                </th>
                <th className="px-6 py-4 font-semibold w-52">
                  Condition & Instances
                </th>
                <th className="px-6 py-4 font-semibold w-24 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingProducts ? (
                <tr>
                  <td className="px-6 py-8 text-slate-500" colSpan={5}>
                    Loading products from the server...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-slate-500" colSpan={5}>
                    No products match the current filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/products/${product.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
                        >
                          {product.name}
                        </Link>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            <Tag className="w-3 h-3" /> {product.category}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400">
                            <Barcode className="w-3 h-3" /> {product.sku}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-700">
                      Rs. {formatPrice(product.price)}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg w-fit">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate max-w-45">
                          {product.location}
                        </span>
                      </div>
                      {product.hasDeletedBranchStock && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 mt-1.5">
                          <AlertCircle className="w-3 h-3" />
                          Includes stock from a deleted branch
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap gap-1">
                          {product.conditions.map((cond) => (
                            <span
                              key={cond}
                              className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${
                                cond === "ORIGINAL_PULL"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : cond === "DEAD_DONOR"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : cond === "COPY"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {cond.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-slate-600">
                          {product.stock > 0
                            ? `${product.stock} instances available`
                            : "0 instances (exhausted)"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right flex items-center justify-end gap-1">
                      <Link
                        href={`/products/${product.id}`}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-block"
                        title="View details"
                      >
                        <Eye className="w-4.5 h-4.5" />
                      </Link>
                      {hasPermission("write:products") &&
                        product.hasDeletedBranchStock && (
                          <button
                            onClick={() =>
                              void handleMoveStock(product.id, product.name)
                            }
                            disabled={movingId === product.id}
                            className="p-2 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Move stock from deleted branch to the active branch"
                          >
                            {movingId === product.id ? (
                              <Loader2 className="w-4.5 h-4.5 animate-spin" />
                            ) : (
                              <MapPin className="w-4.5 h-4.5" />
                            )}
                          </button>
                        )}
                      {hasPermission("delete:products") && (
                        <button
                          onClick={() => setDeleteTarget(product)}
                          className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete product"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==========================================
          🟢 RENDER MODALS HERE
      ========================================== */}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this product?"
        description={
          <>
            <span className="font-bold text-slate-800">
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

      {/* Add Category Modal (Inline for now) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsCategoryModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Add New Category
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Create a new category to organize your products.
            </p>

            <input
              type="text"
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Cables & Adapters"
              className="w-full border border-slate-300 rounded-lg py-2.5 px-3 mb-5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleAddCategory();
                }}
                className="px-4 py-2 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-slate-500">
          Loading products...
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
