"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Tag,
  CheckCircle2,
  Wallet,
  Receipt,
  Barcode,
  PackageOpen,
  ChevronDown,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDriveDownload,
  Layers,
  MapPin,
  MessageCircle,
  ArrowRight,
  XCircle,
} from "lucide-react";
import { offlineDb, type SyncQueueItem, type LocalProduct } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { generateWhatsAppReceipt } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  category?: { name: string };
  instances?: Array<{
    id: string;
    condition: string;
    status: string;
    cabinet?: { name?: string | null; location?: string | null } | null;
  }>;
};

type CartItem = {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  stock?: number;
  qty: number;
  condition?: string;
  isService?: boolean;
  notes?: string;
};

function CreateOrderPOSContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOnline, pendingCount, triggerSync } = useOfflineSync();

  // 1. API & CATALOG STATES
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [categories, setCategories] = useState<string[]>(["All"]);

  // 2. POS STATES
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerMode, setCustomerMode] = useState<"walk-in" | "existing">(
    "walk-in",
  );

  // 3. CUSTOMER SEARCH STATES
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");

  const [conditionModalProduct, setConditionModalProduct] = useState<
    (Product & { conditionCounts?: any }) | null
  >(null);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");

  // 4. DISCOUNT & PAYMENT STATES
  const [discount, setDiscount] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [orderStatus, setOrderStatus] = useState("FINAL");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offlineSuccessMsg, setOfflineSuccessMsg] = useState("");
  const [completedOrderData, setCompletedOrderData] = useState<any | null>(
    null,
  );

  // ==========================================
  // 🟢 FETCH REAL CATEGORIES (Cached with offline fallback)
  // ==========================================
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch("http://localhost:5000/product/getcategories", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.categories)) {
          const names = data.categories.map((c: any) => c.name);
          setCategories(["All", ...names]);
        }
      } catch (error) {
        console.warn(
          "Categories fetch failed, reading from Dexie cache...",
          error,
        );
        const cachedProducts = await offlineDb.products.toArray();
        const catSet = new Set<string>();
        cachedProducts.forEach((p) => {
          if (p.category?.name) catSet.add(p.category.name);
        });
        if (catSet.size > 0) {
          setCategories(["All", ...Array.from(catSet)]);
        }
      }
    };
    void fetchCategories();
  }, []);

  // ==========================================
  // 🟢 FETCH & CACHE PRODUCTS IN DEXIE INDEXEDDB
  // ==========================================
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      try {
        // If navigator is offline, read directly from Dexie
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const cached = await offlineDb.products.toArray();
          let filtered = cached;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.sku && p.sku.toLowerCase().includes(q)),
            );
          }
          if (activeCategory !== "All") {
            filtered = filtered.filter(
              (p) => p.category?.name === activeCategory,
            );
          }
          setProducts(filtered as Product[]);
          setIsLoadingProducts(false);
          return;
        }

        const token = localStorage.getItem("accessToken");
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);
        if (activeCategory !== "All") params.append("category", activeCategory);

        const res = await fetch(
          `http://localhost:5000/product/getproducts?${params.toString()}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        const data = await res.json();

        if (data.success) {
          setProducts(data.products);
          // 🟢 Cache into IndexedDB
          void offlineDb.products.bulkPut(data.products);
        } else {
          // Fallback to Dexie cache
          const cached = await offlineDb.products.toArray();
          if (cached.length > 0) setProducts(cached as Product[]);
        }
      } catch (error) {
        console.warn(
          "Failed to fetch products online, fallback to IndexedDB:",
          error,
        );
        const cached = await offlineDb.products.toArray();
        if (cached.length > 0) {
          setProducts(cached as Product[]);
        }
      } finally {
        setIsLoadingProducts(false);
      }
    };

    const delayDebounceFn = setTimeout(() => void fetchProducts(), 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeCategory]);

  // Pre-fetch all customers into IndexedDB for offline capability
  useEffect(() => {
    const prefetchCustomers = async () => {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        const token = localStorage.getItem("accessToken");
        const res = await fetch(
          "http://localhost:5000/customer/getallcustomers",
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.customers)) {
          void offlineDb.customers.bulkPut(data.customers);
        }
      } catch (err) {
        console.warn("Failed to prefetch customers for offline cache:", err);
      }
    };
    void prefetchCustomers();
  }, []);

  // ==========================================
  // 🟢 FETCH & CACHE CUSTOMERS IN DEXIE INDEXEDDB
  // ==========================================
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const q = customerSearch.toLowerCase();
          const cached = await offlineDb.customers
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.phone.includes(customerSearch),
            )
            .toArray();
          setCustomerResults(cached);
          setIsSearchingCustomer(false);
          return;
        }

        const token = localStorage.getItem("accessToken");
        const res = await fetch(
          `http://localhost:5000/customer/getallcustomers?search=${customerSearch}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        const data = await res.json();
        if (data.success) {
          setCustomerResults(data.customers);
          void offlineDb.customers.bulkPut(data.customers);
        }
      } catch (error) {
        console.warn("Searching customers from IndexedDB fallback...", error);
        const q = customerSearch.toLowerCase();
        const cached = await offlineDb.customers
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.phone.includes(customerSearch),
          )
          .toArray();
        setCustomerResults(cached);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [customerSearch]);

  // ==========================================
  // 🟢 AUTO-LOAD CUSTOMER FROM URL
  // ==========================================
  useEffect(() => {
    const urlCustomerId = searchParams.get("customerId");
    if (urlCustomerId) {
      setCustomerMode("existing");
      const token = localStorage.getItem("accessToken");

      fetch(`http://localhost:5000/customer/${urlCustomerId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setSelectedCustomer(data.customer);
        })
        .catch(() => {
          // Check IndexedDB
          void offlineDb.customers.get(urlCustomerId).then((cached) => {
            if (cached) setSelectedCustomer(cached);
          });
        });
    }
  }, [searchParams]);

  // ==========================================
  // 🟢 OFFLINE-FIRST POS CHECKOUT LOGIC
  // ==========================================
  const handleCompleteOrder = async () => {
    setIsSubmitting(true);
    setOfflineSuccessMsg("");

    const currentCart = [...cart];
    const currentCustomer = selectedCustomer;
    const currentDiscount = Number(discount);
    const currentPaid = Number(amountPaid);
    const currentStatus = orderStatus;

    const payload = {
      customerId:
        customerMode === "walk-in" ? null : selectedCustomer?.id || null,
      walkInName: customerMode === "walk-in" ? walkInName || null : null,
      walkInPhone: customerMode === "walk-in" ? walkInPhone || null : null,
      items: cart.map((item) => ({
        productId: item.isService ? null : item.id,
        quantity: item.qty,
        price: item.price,
        condition: item.condition,
        isService: item.isService,
        serviceName: item.isService ? item.name : undefined,
        notes: item.notes,
      })),
      discount: currentDiscount,
      amountPaid: currentPaid,
      paymentMethod,
      orderStatus: currentStatus, // "MEMO" or "FINAL"
    };

    // 🟢 1. OFFLINE INTERCEPTION
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const localOrderId = crypto.randomUUID();
        const offlineItem: SyncQueueItem = {
          id: localOrderId,
          type: "CREATE_ORDER",
          payload,
          createdAt: new Date().toISOString(),
          status: "pending",
        };

        await offlineDb.syncQueue.put(offlineItem);

        // Deduct from local Dexie cached products
        for (const ci of cart) {
          const cachedProd = await offlineDb.products.get(ci.id);
          if (cachedProd) {
            await offlineDb.products.update(ci.id, {
              stock: Math.max(0, cachedProd.stock - ci.qty),
            });
          }
        }

        // Update local React state
        setProducts((prev) =>
          prev.map((p) => {
            const inCart = cart.find((ci) => ci.id === p.id);
            return inCart
              ? { ...p, stock: Math.max(0, p.stock - inCart.qty) }
              : p;
          }),
        );

        setOfflineSuccessMsg(
          `Offline Intercept: ${orderStatus === "MEMO" ? "MEMO (Amanat)" : "FINAL Sale"} Order (#${localOrderId.slice(0, 8)}) safely queued in IndexedDB. Stock reserved. Will auto-sync when network returns.`,
        );
        setCart([]);
        setAmountPaid("");
        setDiscount(0);
        return;
      } catch (err: any) {
        console.error("Failed to queue offline order:", err);
        alert("Failed to queue offline order: " + err?.message);
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    // 🟢 2. ONLINE SUBMISSION WITH NETWORK RESILIENCE CATCH
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("http://localhost:5000/order/neworder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create order");

      const subtotal = currentCart.reduce((s, i) => s + i.price * i.qty, 0);
      const totalAmount = Number(
        data.order?.totalAmount ?? Math.max(0, subtotal - currentDiscount),
      );
      const orderBalance = Math.max(0, totalAmount - currentPaid);

      setCompletedOrderData({
        id: data.order?.id || "N/A",
        orderNumber: `ORD-${data.order?.orderNumber || data.order?.id?.slice(0, 4) || "NEW"}`,
        status: data.order?.status || currentStatus,
        customer: currentCustomer ||
          data.order?.customer || { name: "Walk-in Customer" },
        items: currentCart.map((c) => ({
          name: c.name,
          qty: c.qty,
          price: c.price,
          total: c.price * c.qty,
        })),
        financials: {
          subtotal,
          discount: currentDiscount,
          total: totalAmount,
          paid: currentPaid,
          balance: orderBalance,
        },
        runningBalance: currentCustomer?.metrics?.outstandingBalance,
        isOffline: false,
      });

      setCart([]);
      setAmountPaid("");
      setDiscount(0);
    } catch (error: any) {
      // Fallback: If network failed during fetch, queue in Dexie instead of crashing!
      const isNetworkIssue =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        error?.name === "TypeError" ||
        error?.message?.includes("fetch");

      if (isNetworkIssue) {
        const localOrderId = crypto.randomUUID();
        const offlineItem: SyncQueueItem = {
          id: localOrderId,
          type: "CREATE_ORDER",
          payload,
          createdAt: new Date().toISOString(),
          status: "pending",
        };
        await offlineDb.syncQueue.put(offlineItem);
        setOfflineSuccessMsg(
          `Network dropped: ${orderStatus} Order queued in IndexedDB (#${localOrderId.slice(0, 8)}). Will sync automatically.`,
        );
        setCart([]);
        setAmountPaid("");
        setDiscount(0);
      } else {
        alert(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cart Functions
  const addToCart = (product: Product, condition: string) => {
    setCart((prev) => {
      const exists = prev.find(
        (item) => item.id === product.id && item.condition === condition,
      );
      if (exists) {
        return prev.map((item) =>
          item.id === product.id && item.condition === condition
            ? { ...item, qty: item.qty + 1 }
            : item,
        );
      }
      return [...prev, { ...product, qty: 1, condition }];
    });
  };

  const addServiceToCart = () => {
    if (!serviceName || !servicePrice)
      return alert("Service Name and Price are required.");
    setCart((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: serviceName,
        price: Number(servicePrice),
        qty: 1,
        isService: true,
        notes: serviceNotes,
      },
    ]);
    setIsServiceModalOpen(false);
    setServiceName("");
    setServicePrice("");
    setServiceNotes("");
  };

  const handleProductClick = (product: Product) => {
    if (product.stock === 0) return alert("Out of stock!");

    const conditionCounts = (product.instances || []).reduce(
      (acc: any, inst: any) => {
        if (inst.status === "AVAILABLE") {
          acc[inst.condition] = (acc[inst.condition] || 0) + 1;
        }
        return acc;
      },
      {},
    );

    if (Object.keys(conditionCounts).length === 0) {
      alert("No available instances for this product!");
    } else if (Object.keys(conditionCounts).length === 1) {
      addToCart(product, Object.keys(conditionCounts)[0]);
    } else {
      setConditionModalProduct({ ...product, conditionCounts });
    }
  };

  const updateQty = (
    id: string,
    condition: string | undefined,
    delta: number,
  ) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id && item.condition === condition) {
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : item;
        }
        return item;
      }),
    );
  };

  const removeItem = (id: string, condition: string | undefined) =>
    setCart((prev) =>
      prev.filter((item) => !(item.id === id && item.condition === condition)),
    );

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const grandTotal = subtotal - (Number(discount) || 0);
  const pendingAmount = grandTotal - (Number(amountPaid) || 0);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden animate-in fade-in duration-500 mt-2 font-sans">
      {/* 🟢 TOP POS HEADER & OFFLINE ENGINE STATUS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Create Order
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                POS
              </span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Point of Sale • Spatial Inventory & Double-Entry Ledger
            </p>
          </div>
        </div>

        {/* Connection & Offline Sync Status Indicator */}
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm animate-pulse">
              <WifiOff className="w-4 h-4 text-amber-600" />
              <span>Offline Mode (Hafeez Centre)</span>
              {pendingCount > 0 && (
                <span className="bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">
                  {pendingCount} Queued
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1.5 rounded-xl">
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online</span>
              </div>
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => void triggerSync()}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sync {pendingCount} Pending</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* 🟢 OFFLINE SUCCESS / QUEUE BANNER */}
      {offlineSuccessMsg && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-bold text-amber-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{offlineSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setOfflineSuccessMsg("")}
            className="text-amber-600 hover:text-amber-800 font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden mt-3 gap-6">
        {/* LEFT SIDE: CATALOG */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-100 flex gap-3 shrink-0 bg-slate-50/50">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products or scan barcode..."
                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
              />
              <Barcode className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 flex items-center gap-2 overflow-x-auto hide-scrollbar border-b border-slate-100 shrink-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === cat ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
            {isLoadingProducts ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Loading products...
              </div>
            ) : products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <PackageOpen className="w-8 h-8 mb-2 opacity-30" />
                No products found in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map((product) => {
                  const primaryCabinet = product.instances?.[0]?.cabinet;
                  const loc =
                    primaryCabinet?.location ||
                    primaryCabinet?.name ||
                    "Cabinet Bin";
                  const condition =
                    product.instances?.[0]?.condition || "ORIGINAL_PULL";

                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      disabled={product.stock === 0}
                      className={`flex flex-col text-left bg-white p-4 rounded-xl border transition-all active:scale-95 shadow-sm relative overflow-hidden ${
                        product.stock === 0
                          ? "border-slate-200 opacity-60 cursor-not-allowed"
                          : "border-slate-200 hover:border-blue-500 hover:shadow-md"
                      }`}
                    >
                      <span className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">
                        {product.name}
                      </span>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-0.5">
                          <Barcode className="w-3 h-3" /> {product.sku || "N/A"}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {condition.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Spatial Cabinet Tag */}
                      <div className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50/70 border border-indigo-100 px-1.5 py-0.5 rounded mb-2.5 truncate w-fit">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-30">{loc}</span>
                      </div>

                      <div className="mt-auto flex items-end justify-between w-full">
                        <span className="text-blue-600 font-black text-sm">
                          Rs. {product.price.toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            product.stock > 5
                              ? "bg-emerald-50 text-emerald-600"
                              : product.stock > 0
                                ? "bg-yellow-50 text-yellow-600"
                                : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          {product.stock === 0
                            ? "Out of stock"
                            : `${product.stock} left`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: CART */}
        <div className="w-full lg:w-105 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0 h-full">
          <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-500" /> Current Invoice
              </h2>
              <button
                onClick={() => setIsServiceModalOpen(true)}
                className="flex items-center gap-1.5 text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm"
              >
                <Plus className="w-3 h-3" /> Add Service
              </button>
            </div>
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
              <button
                onClick={() => {
                  setCustomerMode("walk-in");
                  setSelectedCustomer(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${customerMode === "walk-in" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Walk-in Customer
              </button>
              <button
                onClick={() => setCustomerMode("existing")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${customerMode === "existing" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Existing / Search
              </button>
            </div>

            {customerMode === "walk-in" && (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Customer Name (Optional)"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="text"
                  placeholder="Phone Number (Optional)"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            )}

            {customerMode === "existing" && (
              <div className="mt-3 relative">
                {selectedCustomer ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-blue-900">
                        {selectedCustomer.name}
                      </p>
                      <p className="text-[10px] text-blue-600">
                        {selectedCustomer.phone}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="text-xs text-blue-500 hover:text-rose-600 font-bold"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="Type name or phone number..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    {isSearchingCustomer && (
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Searching...
                      </span>
                    )}

                    {customerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerResults([]);
                              setCustomerSearch("");
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-50 border-b border-slate-50 text-xs flex justify-between"
                          >
                            <span className="font-bold text-slate-800">
                              {c.name}
                            </span>
                            <span className="text-slate-400 font-mono">
                              {c.phone}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                <Receipt className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={`${item.id}-${item.condition}`}
                  className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-xl shadow-sm"
                >
                  <div className="flex-1 pr-3">
                    <p className="text-sm font-bold text-slate-900 leading-tight">
                      {item.name}
                      {item.isService && (
                        <span className="ml-2 text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                          SERVICE
                        </span>
                      )}
                    </p>
                    {item.notes && (
                      <p className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">
                        {item.notes}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs font-medium text-slate-500">
                        Rs. {item.price.toLocaleString()}
                      </p>
                      {!item.isService && item.condition && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.condition.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 shadow-sm">
                      <button
                        onClick={() => updateQty(item.id, item.condition, -1)}
                        className="p-1 hover:bg-slate-200 rounded-l-lg"
                      >
                        <Minus className="w-4 h-4 text-slate-600" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-slate-900">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, item.condition, 1)}
                        className="p-1 hover:bg-slate-200 rounded-r-lg"
                      >
                        <Plus className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.id, item.condition)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 border-t border-slate-200 bg-slate-50 shrink-0 space-y-4">
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <Tag className="w-4 h-4 text-blue-600" /> Discount (Rs)
              </label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="w-24 text-right outline-none font-bold text-rose-600 bg-transparent placeholder-slate-300"
                placeholder="0"
              />
            </div>

            <div className="flex items-end justify-between">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                Grand Total
              </span>
              <span className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                Rs. {grandTotal.toLocaleString()}
              </span>
            </div>

            <hr className="border-slate-200" />

            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    Amount Received
                    {pendingAmount > 0 && cart.length > 0 && (
                      <button
                        onClick={() => setAmountPaid(grandTotal.toString())}
                        className="text-blue-600 hover:underline text-[10px]"
                      >
                        Pay in Full
                      </button>
                    )}
                  </label>
                  <div className="relative">
                    <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="w-1/3">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white cursor-pointer"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                  </select>
                </div>
              </div>

              {/* DUAL-STATE ORDER STATUS SELECTOR */}
              {customerMode === "existing" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Order Status (Dual State Logic)
                  </label>
                  <div className="relative">
                    <select
                      value={orderStatus}
                      onChange={(e) => setOrderStatus(e.target.value)}
                      className={`w-full pl-3 pr-8 py-2 border rounded-lg text-sm font-bold focus:ring-2 outline-none appearance-none cursor-pointer transition-colors ${
                        orderStatus === "FINAL"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-500"
                          : "bg-amber-50 border-amber-200 text-amber-700 focus:ring-amber-500"
                      }`}
                    >
                      <option value="FINAL">
                        FINAL (Handed to customer, Posts to Ledger)
                      </option>
                      <option value="MEMO">
                        MEMO / AMANAT (Locks Physical Stock only)
                      </option>
                    </select>
                    <ChevronDown
                      className={`w-4 h-4 absolute right-2.5 top-2.5 pointer-events-none ${
                        orderStatus === "FINAL"
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleCompleteOrder}
              disabled={
                cart.length === 0 ||
                (customerMode === "walk-in" && pendingAmount > 0) ||
                isSubmitting
              }
              className="w-full py-4 mt-2 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isSubmitting
                ? "Processing..."
                : !isOnline
                  ? `Queue ${orderStatus} Order Offline`
                  : orderStatus === "FINAL"
                    ? "Complete Order"
                    : "Save Pending Order (MEMO)"}
              {!isSubmitting && <CheckCircle2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
      {/* 🟢 POS ORDER SUCCESS & WHATSAPP MODAL */}
      {completedOrderData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-gradient-to-b from-emerald-50 to-white text-center border-b border-slate-100 relative">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {completedOrderData.isOffline
                  ? "Order Queued Offline!"
                  : "Sale Completed Successfully!"}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="font-mono text-sm font-bold text-slate-700">
                  {completedOrderData.orderNumber}
                </span>
                <span
                  className={`text-xs font-extrabold px-2 py-0.5 rounded-md border ${
                    completedOrderData.status === "MEMO"
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}
                >
                  {completedOrderData.status === "MEMO"
                    ? "MEMO (Amanat)"
                    : "FINAL SALE"}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-bold text-slate-900">
                    {completedOrderData.customer.name}{" "}
                    {completedOrderData.customer.phone
                      ? `(${completedOrderData.customer.phone})`
                      : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Items Purchased</span>
                  <span className="font-semibold text-slate-800">
                    {completedOrderData.items.reduce(
                      (s: number, i: any) => s + i.qty,
                      0,
                    )}{" "}
                    item(s)
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-500">Net Total</span>
                  <span className="font-black text-slate-900 text-base">
                    Rs. {completedOrderData.financials.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Paid</span>
                  <span className="font-bold text-emerald-600">
                    Rs. {completedOrderData.financials.paid.toLocaleString()}
                  </span>
                </div>
                {completedOrderData.financials.balance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-rose-600 font-semibold">
                      Remaining Udhar
                    </span>
                    <span className="font-black text-rose-600">
                      Rs.{" "}
                      {completedOrderData.financials.balance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {completedOrderData.isOffline && (
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center font-medium">
                  Saved securely in IndexedDB. Stock is reserved locally and
                  will automatically synchronize when network is restored.
                </p>
              )}

              {/* WhatsApp Receipt Action */}
              <a
                href={generateWhatsAppReceipt(
                  completedOrderData,
                  completedOrderData.customer,
                  completedOrderData.runningBalance,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-bold transition-colors shadow-md shadow-emerald-600/20"
              >
                <MessageCircle className="w-5 h-5" /> Share via WhatsApp
              </a>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {!completedOrderData.isOffline && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/orders/${completedOrderData.id}`)
                    }
                    className="flex items-center justify-center gap-2 py-2.5 px-3 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                  >
                    <span>View Order</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCompletedOrderData(null)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                    completedOrderData.isOffline ? "col-span-2" : ""
                  }`}
                >
                  <Plus className="w-4 h-4" /> Next Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 🟢 CONDITION SELECTOR MODAL */}
      {conditionModalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Select Condition</h3>
              <button
                onClick={() => setConditionModalProduct(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm font-medium text-slate-700 mb-3">
                {conditionModalProduct.name}
              </p>
              {Object.entries(conditionModalProduct.conditionCounts || {}).map(
                ([cond, count]) => (
                  <button
                    key={cond}
                    onClick={() => {
                      addToCart(conditionModalProduct, cond);
                      setConditionModalProduct(null);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <span className="font-bold text-slate-800 text-sm">
                      {cond.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                      {count as number} Available
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🟢 SERVICE MODAL */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Add Service / Labor</h3>
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Service Name
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="e.g. Screen Fitting, Repair"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Price (Rs)
                </label>
                <input
                  type="number"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Device Notes (Optional)
                </label>
                <input
                  type="text"
                  value={serviceNotes}
                  onChange={(e) => setServiceNotes(e.target.value)}
                  placeholder="IMEI, Passcode, Color..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                onClick={addServiceToCart}
                className="w-full py-2.5 mt-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-md"
              >
                Add to Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateOrderPOS() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-slate-500">
          Loading POS...
        </div>
      }
    >
      <CreateOrderPOSContent />
    </Suspense>
  );
}
