"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Receipt,
  Barcode,
  PackageOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDriveDownload,
  MapPin,
  Wrench,
  X,
  LayoutGrid,
  List,
  GripVertical,
  ChevronRight,
} from "lucide-react";
import { offlineDb, type SyncQueueItem } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { generateWhatsAppReceipt } from "@/lib/utils";
import OrderSuccessModal, {
  type CompletedOrderData,
} from "@/components/modals/OrderSuccessModal";
import NewCustomerModal from "@/components/modals/NewCustomerModal";
import CheckoutDrawer from "@/components/pos/CheckoutDrawer";
import { usePOS } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
import { useToast } from "@/context/ToastContext";

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
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();

  // 🟢 BARCODE SCANNER FOCUS TRAP STATES
  const [scanFeedback, setScanFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const scanBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // 1. API & CATALOG STATES
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [catalogView, setCatalogView] = useState<"grid" | "list">("grid");

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

  // Inline condition picker (product card expands, not a modal)
  const [expandedConditionProduct, setExpandedConditionProduct] = useState<
    (Product & { conditionCounts?: any }) | null
  >(null);

  // Inline service/labor form in the cart (not a modal)
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");

  // Interrupt modal — create a customer without losing cart state
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);

  // 4. DISCOUNT & PAYMENT STATES
  const [discount, setDiscount] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [orderStatus, setOrderStatus] = useState("FINAL");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offlineSuccessMsg, setOfflineSuccessMsg] = useState("");
  const [completedOrderData, setCompletedOrderData] =
    useState<CompletedOrderData | null>(null);

  // ==========================================
  // 🟢 FETCH REAL CATEGORIES (Cached with offline fallback)
  // ==========================================
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`${API_BASE_URL}/product/getcategories`, {
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
          `${API_BASE_URL}/product/getproducts?${params.toString()}`,
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
        const res = await fetch(`${API_BASE_URL}/customer/getallcustomers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
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
                (c.shopName && c.shopName.toLowerCase().includes(q)) ||
                c.phone.includes(customerSearch),
            )
            .toArray();
          setCustomerResults(cached);
          setIsSearchingCustomer(false);
          return;
        }

        const token = localStorage.getItem("accessToken");
        const res = await fetch(
          `${API_BASE_URL}/customer/getallcustomers?search=${customerSearch}`,
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
              (c.shopName && c.shopName.toLowerCase().includes(q)) ||
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

      fetch(`${API_BASE_URL}/customer/${urlCustomerId}`, {
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

  // Helper to safely deduct stock in Dexie and React state
  const deductLocalStock = async (cartItems: CartItem[]) => {
    for (const ci of cartItems) {
      if (ci.isService) continue;
      const cachedProd = await offlineDb.products.get(ci.id);
      if (cachedProd) {
        await offlineDb.products.update(ci.id, {
          stock: Math.max(0, cachedProd.stock - ci.qty),
        });
      }
    }

    setProducts((prev) =>
      prev.map((p) => {
        const inCart = cartItems.find((ci) => ci.id === p.id);
        if (!inCart || inCart.isService) return p;
        let deducted = 0;
        const updatedInstances = (p.instances || []).map((inst) => {
          if (
            inst.status === "AVAILABLE" &&
            (!inCart.condition || inst.condition === inCart.condition) &&
            deducted < inCart.qty
          ) {
            deducted++;
            return { ...inst, status: "SOLD" };
          }
          return inst;
        });
        return {
          ...p,
          stock: Math.max(0, p.stock - inCart.qty),
          instances: updatedInstances,
        };
      }),
    );
  };

  // ==========================================
  // 🟢 OFFLINE-FIRST POS CHECKOUT LOGIC
  // ==========================================
  const handleCompleteOrder = async (
    statusOverride?: string | React.MouseEvent,
  ) => {
    if (cart.length === 0) return false;
    setIsSubmitting(true);

    const currentCart = [...cart];
    const currentDiscount = Number(discount) || 0;
    const currentPaid = Number(amountPaid) || 0;
    const currentCustomer = selectedCustomer;
    const currentStatus =
      typeof statusOverride === "string" ? statusOverride : orderStatus;

    const payload = {
      customerId: selectedCustomer?.id || null,
      walkInName: customerMode === "walk-in" ? walkInName || null : null,
      walkInPhone: customerMode === "walk-in" ? walkInPhone || null : null,
      discount: currentDiscount,
      status: currentStatus,
      amountPaid: currentPaid,
      paymentMethod,
      items: currentCart.map((item) => ({
        productId: item.isService ? null : item.id,
        quantity: item.qty,
        condition: item.condition,
        isService: !!item.isService,
        serviceName: item.isService ? item.name : null,
        notes: item.notes || null,
        price: item.price,
      })),
    };

    // 🟢 1. EXPLICIT OFFLINE SUBMISSION
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
        await deductLocalStock(currentCart);

        const subtotalOffline = currentCart.reduce(
          (s, i) => s + i.price * i.qty,
          0,
        );
        const netTotalOffline = Math.max(0, subtotalOffline - currentDiscount);
        const balanceOffline = Math.max(0, netTotalOffline - currentPaid);

        setCompletedOrderData({
          id: localOrderId,
          orderNumber: `ORD-${localOrderId.slice(0, 6).toUpperCase()}`,
          status: currentStatus,
          customer: currentCustomer || {
            name:
              customerMode === "walk-in"
                ? walkInName || "Walk-in Customer"
                : "Walk-in Customer",
            phone: customerMode === "walk-in" ? walkInPhone || null : null,
          },
          items: currentCart.map((c) => ({
            name: c.name,
            qty: c.qty,
            price: c.price,
            total: c.price * c.qty,
            isService: c.isService,
          })),
          financials: {
            subtotal: subtotalOffline,
            discount: currentDiscount,
            total: netTotalOffline,
            paid: currentPaid,
            balance: balanceOffline,
          },
          paymentMethod,
          runningBalance: currentCustomer?.metrics?.outstandingBalance,
          isOffline: true,
          createdAt: new Date().toISOString(),
        });

        toast.info(
          `Offline Intercept: Order queued in IndexedDB (#${localOrderId.slice(0, 8)}). Stock reserved.`,
        );
        setCart([]);
        setAmountPaid("");
        setDiscount("");
        return true;
      } catch (err: any) {
        console.error("Failed to queue offline order:", err);
        toast.error("Failed to queue offline order: " + err?.message);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    }

    // 🟢 2. ONLINE SUBMISSION WITH NETWORK RESILIENCE CATCH
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE_URL}/order/neworder`, {
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
          data.order?.customer || {
            name:
              customerMode === "walk-in"
                ? walkInName || "Walk-in Customer"
                : "Walk-in Customer",
            phone: customerMode === "walk-in" ? walkInPhone || null : null,
          },
        items: currentCart.map((c) => ({
          name: c.name,
          qty: c.qty,
          price: c.price,
          total: c.price * c.qty,
          isService: c.isService,
        })),
        financials: {
          subtotal,
          discount: currentDiscount,
          total: totalAmount,
          paid: currentPaid,
          balance: orderBalance,
        },
        paymentMethod,
        runningBalance: currentCustomer?.metrics?.outstandingBalance,
        isOffline: false,
        createdAt: data.order?.createdAt || new Date().toISOString(),
      });

      toast.success("Order created successfully!");
      setCart([]);
      setAmountPaid("");
      setDiscount("");
      return true;
    } catch (error: any) {
      // Fallback: If network failed during fetch, queue in Dexie AND deduct local stock!
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
        // CRITICAL FIX: Also deduct local instance cache so double-selling is impossible
        await deductLocalStock(currentCart);

        const subtotalOffline = currentCart.reduce(
          (s, i) => s + i.price * i.qty,
          0,
        );
        const netTotalOffline = Math.max(0, subtotalOffline - currentDiscount);
        const balanceOffline = Math.max(0, netTotalOffline - currentPaid);

        setCompletedOrderData({
          id: localOrderId,
          orderNumber: `ORD-${localOrderId.slice(0, 6).toUpperCase()}`,
          status: currentStatus,
          customer: currentCustomer || {
            name:
              customerMode === "walk-in"
                ? walkInName || "Walk-in Customer"
                : "Walk-in Customer",
            phone: customerMode === "walk-in" ? walkInPhone || null : null,
          },
          items: currentCart.map((c) => ({
            name: c.name,
            qty: c.qty,
            price: c.price,
            total: c.price * c.qty,
            isService: c.isService,
          })),
          financials: {
            subtotal: subtotalOffline,
            discount: currentDiscount,
            total: netTotalOffline,
            paid: currentPaid,
            balance: balanceOffline,
          },
          paymentMethod,
          runningBalance: currentCustomer?.metrics?.outstandingBalance,
          isOffline: true,
          createdAt: new Date().toISOString(),
        });

        toast.warning(
          `Connection dropped mid-flight: Order queued in IndexedDB (#${localOrderId.slice(0, 8)}). Local stock reserved.`,
        );
        setCart([]);
        setAmountPaid("");
        setDiscount("");
        return true;
      } else {
        toast.error(error.message || "Failed to create order");
        return false;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate stock limits (Cap services at 99, physical items at available stock)
  const getMaxAllowedQty = useCallback(
    (item: { id: string; condition?: string; isService?: boolean }) => {
      if (item.isService) return 99;
      const prod = products.find((p) => p.id === item.id);
      if (!prod) return 999;
      if (prod.instances && item.condition) {
        const matchingAvailable = prod.instances.filter(
          (i) => i.status === "AVAILABLE" && i.condition === item.condition,
        ).length;
        return Math.max(1, matchingAvailable);
      }
      return Math.max(1, prod.stock);
    },
    [products],
  );

  // Cart Functions
  const addToCart = (product: Product, condition: string) => {
    const maxAllowed = getMaxAllowedQty({
      id: product.id,
      condition,
      isService: false,
    });
    const exists = cart.find(
      (item) => item.id === product.id && item.condition === condition,
    );
    if (exists && exists.qty >= maxAllowed) {
      toast.warning(
        `Maximum stock limit (${maxAllowed}) reached for "${product.name}".`,
      );
      return;
    }

    setCart((prev) => {
      const itemExists = prev.find(
        (item) => item.id === product.id && item.condition === condition,
      );
      if (itemExists) {
        return prev.map((item) =>
          item.id === product.id && item.condition === condition
            ? { ...item, qty: Math.min(maxAllowed, item.qty + 1) }
            : item,
        );
      }
      return [...prev, { ...product, qty: 1, condition }];
    });
    setExpandedConditionProduct(null);
  };

  // 🟢 BARCODE SCANNER FOCUS TRAP HANDLER
  const handleBarcodeScan = useCallback(
    async (scannedSku: string) => {
      const cleanSku = scannedSku.trim();
      if (!cleanSku) return;

      // 1. Try to find in local products state
      let targetProduct = products.find(
        (p) => p.sku && p.sku.trim().toLowerCase() === cleanSku.toLowerCase(),
      );

      // 2. Try to find in Dexie IndexedDB cache if not found locally
      if (!targetProduct) {
        try {
          const allCached = await offlineDb.products.toArray();
          targetProduct = allCached.find(
            (p) =>
              p.sku && p.sku.trim().toLowerCase() === cleanSku.toLowerCase(),
          ) as Product | undefined;
        } catch {}
      }

      // 3. Fallback: Query backend by exact SKU/search
      if (!targetProduct) {
        try {
          const token = localStorage.getItem("accessToken");
          const res = await fetch(
            `${API_BASE_URL}/product/getproducts?search=${encodeURIComponent(cleanSku)}`,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.products)) {
              targetProduct = data.products.find(
                (p: any) =>
                  p.sku &&
                  p.sku.trim().toLowerCase() === cleanSku.toLowerCase(),
              );
            }
          }
        } catch {}
      }

      if (targetProduct) {
        const availableInstances =
          targetProduct.instances?.filter((i) => i.status === "AVAILABLE") ||
          [];
        const condition = availableInstances[0]?.condition || "ORIGINAL_PULL";

        addToCart(targetProduct, condition);
        setScanFeedback({
          type: "success",
          message: `Scanned: "${targetProduct.name}" (SKU: ${cleanSku}) added to cart!`,
        });
      } else {
        setScanFeedback({
          type: "error",
          message: `No product found for scanned SKU: "${cleanSku}"`,
        });
      }

      setTimeout(() => {
        setScanFeedback(null);
      }, 4000);
    },
    [products, addToCart],
  );

  // 🟢 GLOBAL KEYBOARD FOCUS TRAP FOR BARCODE SCANNERS
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore system shortcuts
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const buffered = scanBufferRef.current.trim();
        // Hardware scanners output characters rapidly (< 75ms between keys) followed by Enter
        if (buffered.length >= 2) {
          e.preventDefault();
          e.stopPropagation();
          scanBufferRef.current = "";
          handleBarcodeScan(buffered);

          // Clear any input field that captured the barcode characters
          const activeEl = document.activeElement as HTMLInputElement | null;
          if (
            activeEl &&
            (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
          ) {
            if (activeEl.value.includes(buffered)) {
              activeEl.value = activeEl.value.replace(buffered, "").trim();
            }
          }
          return;
        }
        scanBufferRef.current = "";
        return;
      }

      if (e.key.length === 1) {
        // If typing speed is human pace (> 75ms), reset buffer
        if (timeDiff > 75) {
          scanBufferRef.current = e.key;
        } else {
          scanBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [handleBarcodeScan]);

  const addServiceToCart = () => {
    if (!serviceName || !servicePrice) {
      toast.error("Service Name and Price are required.");
      return;
    }
    const numPrice = Number(servicePrice);
    if (isNaN(numPrice) || numPrice < 0) {
      toast.error("Please enter a valid price for the service.");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: serviceName,
        price: numPrice,
        qty: 1,
        isService: true,
        notes: serviceNotes,
      },
    ]);
    setIsServiceFormOpen(false);
    setServiceName("");
    setServicePrice("");
    setServiceNotes("");
    toast.success(`Added labor "${serviceName}" to invoice.`);
  };

  const handleProductClick = (product: Product) => {
    const availableInstances =
      product.instances?.filter((i) => i.status === "AVAILABLE") || [];

    if (availableInstances.length === 0) {
      return;
    }

    const conditionCounts = availableInstances.reduce((acc: any, inst: any) => {
      acc[inst.condition] = (acc[inst.condition] || 0) + 1;
      return acc;
    }, {});

    if (Object.keys(conditionCounts).length === 0) {
      return;
    } else if (Object.keys(conditionCounts).length === 1) {
      addToCart(product, Object.keys(conditionCounts)[0]);
    } else {
      // Toggle inline condition picker on the card (no modal)
      setExpandedConditionProduct(
        expandedConditionProduct?.id === product.id
          ? null
          : { ...product, conditionCounts },
      );
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
          const maxAllowed = getMaxAllowedQty(item);
          const targetQty = item.qty + delta;
          if (targetQty > maxAllowed) {
            toast.warning(
              item.isService
                ? "Labor/service items are capped at 99."
                : `Maximum available stock (${maxAllowed}) reached.`,
            );
            return { ...item, qty: maxAllowed };
          }
          return targetQty > 0 ? { ...item, qty: targetQty } : item;
        }
        return item;
      }),
    );
  };

  const setDirectQty = (
    id: string,
    condition: string | undefined,
    qty: number,
  ) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id && item.condition === condition) {
          const maxAllowed = getMaxAllowedQty(item);
          let safeQty = Math.max(1, isNaN(qty) ? 1 : qty);
          if (safeQty > maxAllowed) {
            toast.warning(
              item.isService
                ? "Labor/service items are capped at 99."
                : `Quantity adjusted to available stock limit (${maxAllowed}).`,
            );
            safeQty = maxAllowed;
          }
          return { ...item, qty: safeQty };
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
  const grandTotal = Math.max(0, subtotal - (Number(discount) || 0));
  const pendingAmount = grandTotal - (Number(amountPaid) || 0);

  const getDisabledReason = () => {
    if (cart.length === 0) {
      return "Add items or services to the invoice first.";
    }
    if (customerMode === "existing" && !selectedCustomer) {
      return "Select an existing customer to proceed with customer account.";
    }
    if (customerMode === "walk-in" && pendingAmount > 0) {
      return "Enter full amount or select an existing customer for Udhar.";
    }
    return null;
  };

  // 🟢 CHECKOUT DRAWER (customer + payment overlay)
  const { isCheckoutOpen, setIsCheckoutOpen } = usePOS();

  // 🟢 TWO-COLUMN RATIO (default 60/40 Catalog:Cart) WITH LOCALSTORAGE MEMORY
  const [catalogRatio, setCatalogRatio] = useState(0.6);
  const [isRatioDragging, setIsRatioDragging] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const ratioDragRef = useRef<number | null>(null);
  const ratioStartXRef = useRef(0);
  const ratioStartRatioRef = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("deepkhata_pos_ratio");
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= 0.45 && parsed <= 0.75) {
          setCatalogRatio(parsed);
        }
      }
    } catch {}
  }, []);

  const handleRatioDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    ratioDragRef.current = e.clientX;
    ratioStartXRef.current = e.clientX;
    ratioStartRatioRef.current = catalogRatio;
    setIsRatioDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (ratioDragRef.current === null) return;
      if (!layoutRef.current) return;
      const delta = e.clientX - ratioStartXRef.current;
      const containerWidth = layoutRef.current.clientWidth || 1;
      const newRatio = Math.max(
        0.45,
        Math.min(0.75, ratioStartRatioRef.current + delta / containerWidth),
      );
      setCatalogRatio(newRatio);
      try {
        localStorage.setItem("deepkhata_pos_ratio", String(newRatio));
      } catch {}
    };

    const onMouseUp = () => {
      if (ratioDragRef.current !== null) {
        ratioDragRef.current = null;
        setIsRatioDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const resetRatio = () => {
    setCatalogRatio(0.6);
    try {
      localStorage.setItem("deepkhata_pos_ratio", "0.6");
    } catch {}
  };

  const disabledReason = getDisabledReason();

  return (
    <div className="flex flex-col h-[calc(100vh-125px)] min-h-0 overflow-hidden font-sans">
      {/* 🟢 TOP POS HEADER & OFFLINE ENGINE STATUS BAR */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Unified POS
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Parts + Labor
              </span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Point of Sale • Spatial Inventory & Double-Entry Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm animate-pulse">
              <WifiOff className="w-4 h-4 text-amber-600" />
              <span>Offline Mode</span>
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
                <span className="hidden sm:inline">Online</span>
              </div>
              {pendingCount > 0 && (
                <button
                  onClick={() => triggerSync()}
                  className="flex items-center gap-1.5 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                  title="Click to sync offline items"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sync ({pendingCount})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {offlineSuccessMsg && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-bold text-amber-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{offlineSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setOfflineSuccessMsg("")}
            className="text-amber-600 hover:text-amber-800 font-bold px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {scanFeedback && (
        <div
          className={`mx-3 sm:mx-6 mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
            scanFeedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Barcode className="w-4 h-4 text-blue-600" />
            <span>{scanFeedback.message}</span>
          </div>
          <button
            onClick={() => setScanFeedback(null)}
            className="text-slate-400 hover:text-slate-700 px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================
          TWO-COLUMN RESPONSIVE LAYOUT
          Desktop (lg+): Catalog (60%) | Cart (40%), optional drag resize
          Mobile: Vertical stacked cards
      ==================================================== */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-y-hidden mt-3 min-h-0 pb-1.5">
        <div
          ref={layoutRef}
          className="flex flex-col lg:flex-row items-stretch h-auto lg:h-full gap-4 w-full"
        >
          {/* ───────── LEFT COLUMN: PRODUCT CATALOG ───────── */}
          <div
            style={{ flexGrow: catalogRatio, flexBasis: 0 }}
            className="w-full lg:w-auto flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[480px] lg:min-h-0 shrink-0 lg:min-w-[280px]"
          >
            <div className="p-3.5 border-b border-slate-100 shrink-0 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Catalog
                </span>
                <span
                  title="USB/Bluetooth barcode scanner focus trap is globally active. Any rapid scan will auto-add item to cart."
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Scanner Active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products or scan barcode (SKU)..."
                    className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  />
                  <Barcode className="h-4 w-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
                {/* Grid / List toggle */}
                <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm p-0.5 shrink-0">
                  <button
                    onClick={() => setCatalogView("grid")}
                    title="Grid view"
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer ${catalogView === "grid" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCatalogView("list")}
                    title="Compact list view"
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer ${catalogView === "list" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="px-3.5 pt-2.5 pb-2 flex items-center gap-1.5 overflow-x-auto hide-scrollbar border-b border-slate-100 shrink-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${activeCategory === cat ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div
              className={`flex-1 overflow-y-auto p-3 bg-slate-50/50 ${catalogView === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5 content-start" : "flex flex-col gap-1.5 content-start"}`}
            >
              {isLoadingProducts ? (
                <div className="col-span-full h-40 flex items-center justify-center text-slate-400 text-sm">
                  Loading products...
                </div>
              ) : products.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center text-slate-400 text-sm py-12">
                  <PackageOpen className="w-8 h-8 mb-2 opacity-30" />
                  No products found in this category.
                </div>
              ) : catalogView === "list" ? (
                products.map((product) => {
                  const availableInstances =
                    product.instances?.filter(
                      (i) => i.status === "AVAILABLE",
                    ) || [];
                  const availableCount = availableInstances.length;
                  const isOutOfStock = availableCount === 0;

                  const conditions = Array.from(
                    new Set(
                      availableInstances.length > 0
                        ? availableInstances.map((i) => i.condition)
                        : product.instances?.map((i) => i.condition) || [],
                    ),
                  );

                  const isExpanded =
                    expandedConditionProduct?.id === product.id;

                  return (
                    <div key={product.id} className="relative">
                      <button
                        onClick={() => handleProductClick(product)}
                        disabled={isOutOfStock}
                        className={`flex flex-col gap-1.5 w-full p-2.5 rounded-xl border transition-all text-left ${
                          isOutOfStock
                            ? "border-slate-200 bg-slate-100/70 opacity-50 cursor-not-allowed select-none"
                            : "bg-white border-slate-200 hover:border-blue-500 hover:shadow-xs shadow-2xs cursor-pointer"
                        } ${isExpanded ? "border-blue-500 ring-1 ring-blue-500/20" : ""}`}
                      >
                        {/* Top Row: Full Product Name & Price */}
                        <div className="flex items-start justify-between gap-2 w-full">
                          <span
                            className={`font-bold text-xs sm:text-sm line-clamp-1 flex-1 min-w-0 break-words ${
                              isOutOfStock ? "text-slate-400" : "text-slate-900"
                            }`}
                          >
                            {product.name}
                          </span>
                          <span
                            className={`text-xs font-black shrink-0 ${
                              isOutOfStock ? "text-slate-400" : "text-blue-600"
                            }`}
                          >
                            Rs. {product.price.toLocaleString()}
                          </span>
                        </div>

                        {/* Bottom Row: Conditions, Stock & Add Action */}
                        <div className="flex items-center justify-between gap-1.5 w-full">
                          <div className="flex items-center gap-1 flex-wrap min-w-0">
                            {conditions.slice(0, 2).map((cond) => (
                              <span
                                key={cond}
                                className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${
                                  cond === "DEFECTIVE"
                                    ? "bg-red-50 text-red-600"
                                    : cond === "DEAD_DONOR"
                                      ? "bg-rose-50 text-rose-600"
                                      : cond === "COPY"
                                        ? "bg-blue-50 text-blue-600"
                                        : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {cond.replace(/_/g, " ")}
                              </span>
                            ))}
                            {conditions.length > 2 && (
                              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                +{conditions.length - 2}
                              </span>
                            )}
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                isOutOfStock
                                  ? "bg-slate-200 text-slate-500"
                                  : availableCount <= 3
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-emerald-50 text-emerald-600"
                              }`}
                            >
                              {isOutOfStock ? "Out" : `${availableCount} left`}
                            </span>
                          </div>

                          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-white hover:bg-blue-600 transition-colors shrink-0">
                            <Plus className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </button>

                      {isExpanded &&
                        expandedConditionProduct?.conditionCounts && (
                          <div
                            className="mt-1 rounded-lg border border-blue-200 bg-white shadow-sm p-1.5 space-y-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {Object.entries(
                              expandedConditionProduct.conditionCounts,
                            ).map(([cond, count]) => (
                              <button
                                key={cond}
                                onClick={() =>
                                  addToCart(expandedConditionProduct, cond)
                                }
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left bg-blue-50/60 hover:bg-blue-100 transition-colors cursor-pointer"
                              >
                                <span className="font-semibold text-slate-800 text-[11px]">
                                  {cond.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {count as number} avail
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })
              ) : (
                products.map((product) => {
                  const availableInstances =
                    product.instances?.filter(
                      (i) => i.status === "AVAILABLE",
                    ) || [];
                  const availableCount = availableInstances.length;
                  const isOutOfStock = availableCount === 0;

                  const primaryCabinet = product.instances?.[0]?.cabinet;
                  const loc =
                    primaryCabinet?.location ||
                    primaryCabinet?.name ||
                    "Cabinet Bin";

                  const isExpanded =
                    expandedConditionProduct?.id === product.id;

                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      disabled={isOutOfStock}
                      className={`group flex flex-col text-left p-3 rounded-xl border transition-all relative overflow-hidden ${
                        isOutOfStock
                          ? "border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed select-none"
                          : "bg-white border-slate-200 hover:border-blue-500 hover:shadow-md active:scale-[0.98] shadow-sm cursor-pointer"
                      }`}
                    >
                      {/* Card Header: Category & Stock Status */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5 w-full">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                          {product.category?.name || "General"}
                        </span>
                        {isOutOfStock ? (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                            Out of Stock
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 border ${
                              availableCount <= 3
                                ? "bg-amber-50 text-amber-600 border-amber-200"
                                : "bg-emerald-50 text-emerald-600 border-emerald-200"
                            }`}
                          >
                            {availableCount} left
                          </span>
                        )}
                      </div>

                      {/* Product Title (2 lines max, never clipped or cut off) */}
                      <h4
                        className={`font-bold text-xs sm:text-sm line-clamp-2 leading-snug mb-1.5 break-words ${
                          isOutOfStock
                            ? "text-slate-400"
                            : "text-slate-900 group-hover:text-blue-600 transition-colors"
                        }`}
                      >
                        {product.name}
                      </h4>

                      {/* Condition badges */}
                      <div className="flex flex-wrap items-center gap-1 mb-2">
                        {Array.from(
                          new Set(availableInstances.map((i) => i.condition)),
                        ).map((cond) => (
                          <span
                            key={cond}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                          >
                            {cond.replace(/_/g, " ")}
                          </span>
                        ))}
                        {availableInstances.length === 0 &&
                          product.instances?.[0]?.condition && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              {product.instances[0].condition.replace(
                                /_/g,
                                " ",
                              )}
                            </span>
                          )}

                        {/* Spatial Bin Location */}
                        {loc && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded truncate max-w-28">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{loc}</span>
                          </span>
                        )}
                      </div>

                      {/* Bottom: Price & Quick Action */}
                      <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between gap-1 w-full">
                        <span
                          className={`font-black text-xs sm:text-sm ${
                            isOutOfStock ? "text-slate-400" : "text-blue-600"
                          }`}
                        >
                          Rs. {product.price.toLocaleString()}
                        </span>
                        {!isOutOfStock && (
                          <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-600 group-hover:underline flex items-center gap-0.5 shrink-0 transition-colors">
                            <Plus className="w-3 h-3" /> Add
                          </span>
                        )}
                      </div>

                      {/* INLINE CONDITION PICKER */}
                      {isExpanded &&
                        expandedConditionProduct?.conditionCounts && (
                          <div
                            className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 space-y-1.5 w-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {Object.entries(
                              expandedConditionProduct.conditionCounts,
                            ).map(([cond, count]) => (
                              <button
                                key={cond}
                                onClick={() =>
                                  addToCart(expandedConditionProduct, cond)
                                }
                                className="w-full flex items-center justify-between p-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                              >
                                <span className="font-bold text-slate-800 text-xs">
                                  {cond.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-blue-100">
                                  {count as number} avail
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RESIZE HANDLE (Catalog / Cart ratio) */}
          <div
            onMouseDown={handleRatioDragStart}
            onDoubleClick={resetRatio}
            style={{ cursor: "col-resize" }}
            className={`hidden lg:flex relative w-4 -mx-2 flex-col items-center justify-center select-none z-20 shrink-0 group ${
              isRatioDragging
                ? "bg-blue-100/40"
                : "hover:bg-blue-50/50"
            } transition-colors`}
          >
            {/* Full-height visible divider track */}
            <div
              className={`w-[2px] h-full transition-all duration-150 ${
                isRatioDragging
                  ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                  : "bg-slate-200 group-hover:bg-blue-400"
              }`}
              style={{ cursor: "col-resize" }}
            />

            {/* Centered tactile grip pill */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-9 rounded-full border flex items-center justify-center transition-all duration-150 shadow-sm pointer-events-none ${
                isRatioDragging
                  ? "bg-blue-600 border-blue-700 text-white scale-110 shadow-md"
                  : "bg-white border-slate-300 text-slate-400 group-hover:border-blue-400 group-hover:text-blue-600 group-hover:scale-105 group-hover:shadow"
              }`}
              style={{ cursor: "col-resize" }}
            >
              <GripVertical className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* ───────── RIGHT COLUMN: UNIFIED CART ───────── */}
          <div
            style={{ flexGrow: 1 - catalogRatio, flexBasis: 0 }}
            className="w-full lg:w-auto flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[360px] lg:min-h-0 shrink-0 lg:min-w-[280px]"
          >
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Receipt className="w-4 h-4 text-blue-600 shrink-0" />
                <h2 className="font-bold text-slate-800 text-sm truncate">
                  Invoice
                </h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
                  {cart.length} {cart.length === 1 ? "line" : "lines"}
                </span>
              </div>
              <button
                onClick={() => setIsServiceFormOpen(!isServiceFormOpen)}
                className="flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm shrink-0 whitespace-nowrap cursor-pointer"
              >
                <Wrench className="w-3 h-3" />
                <span>+ Service</span>
              </button>
            </div>

            {/* INLINE SERVICE / LABOR FORM (inline in cart, no modal) */}
            {isServiceFormOpen && (
              <div className="p-3.5 border-b border-blue-100 bg-blue-50/40 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> Labor / Service Line
                  </h3>
                  <button
                    onClick={() => setIsServiceFormOpen(false)}
                    className="text-blue-400 hover:text-rose-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    placeholder="e.g. Screen Fitting"
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <input
                    type="number"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    placeholder="Price (Rs)"
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <input
                  type="text"
                  value={serviceNotes}
                  onChange={(e) => setServiceNotes(e.target.value)}
                  placeholder="Device notes (IMEI, model, color)"
                  className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  onClick={addServiceToCart}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors shadow-md cursor-pointer"
                >
                  Add Labor to Invoice
                </button>
              </div>
            )}

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 p-4 text-center">
                  <Receipt className="w-10 h-10 opacity-25" />
                  <p className="text-sm font-semibold text-slate-500">
                    Cart is empty
                  </p>
                  <p className="text-xs text-slate-400 max-w-48 leading-relaxed">
                    Add parts from the catalog or attach labor to build invoice.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={`${item.id}-${item.condition}-${item.isService}`}
                    className={`p-3 rounded-xl border shadow-2xs space-y-2 transition-all ${
                      item.isService
                        ? "bg-blue-50/40 border-blue-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Row 1: Full Item Name & Remove Action */}
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug break-words">
                          {item.isService && (
                            <Wrench className="inline w-3.5 h-3.5 text-blue-600 mr-1 shrink-0" />
                          )}
                          {item.name}
                          {item.isService && (
                            <span className="ml-1.5 text-[8.5px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                              LABOR
                            </span>
                          )}
                        </h4>
                        {item.notes && (
                          <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      {!isAuthLoading && user && user.role !== "STAFF" && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id, item.condition)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors shrink-0"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Row 2: Unit Price & Condition Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-600">
                        Rs. {item.price.toLocaleString()} each
                      </span>
                      {!item.isService && item.condition && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.condition.replace(/_/g, " ")}
                        </span>
                      )}
                      {!item.isService && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                          Part
                        </span>
                      )}
                      {item.qty >= getMaxAllowedQty(item) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          {item.isService
                            ? "Max limit (99)"
                            : `Max available (${getMaxAllowedQty(item)})`}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Typed Stepper & Line Subtotal */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                      <div className="flex items-center bg-white rounded-lg border border-slate-300 shadow-2xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.condition, -1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
                          title="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={getMaxAllowedQty(item)}
                          value={item.qty}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setDirectQty(
                              item.id,
                              item.condition,
                              isNaN(val) ? 1 : val,
                            );
                          }}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value, 10);
                            const max = getMaxAllowedQty(item);
                            if (isNaN(val) || val < 1) {
                              setDirectQty(item.id, item.condition, 1);
                            } else if (val > max) {
                              setDirectQty(item.id, item.condition, max);
                            }
                          }}
                          className="w-11 h-7 text-center text-xs font-black text-slate-900 bg-slate-50/70 border-x border-slate-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-white"
                          title="Type quantity directly"
                        />
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.condition, 1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
                          title="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[9.5px] text-slate-400 block font-medium leading-tight">
                          Subtotal
                        </span>
                        <span className="text-xs sm:text-sm font-black text-blue-600">
                          Rs. {(item.price * item.qty).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 🟢 CART FOOTER: RUNNING TOTALS + CHECKOUT TRIGGER */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50/70 shrink-0 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Subtotal
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    Rs. {subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Grand Total
                  </span>
                  {Number(discount) > 0 && (
                    <span className="block text-[10px] font-semibold text-rose-500 -mt-0.5">
                      - Rs. {(Number(discount) || 0).toLocaleString()} discount
                    </span>
                  )}
                  <span className="text-xl font-black text-blue-600">
                    Rs. {grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsCheckoutOpen(true)}
                disabled={cart.length === 0}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-base transition-all shadow-lg shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
              >
                Proceed to Checkout
                <ChevronRight className="w-5 h-5" />
              </button>

              {cart.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Add items to the invoice to enable checkout.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 🟢 CHECKOUT DRAWER — customer, discount & payment overlay */}
      <CheckoutDrawer
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onCompleteOrder={handleCompleteOrder}
        customerMode={customerMode}
        setCustomerMode={setCustomerMode}
        walkInName={walkInName}
        setWalkInName={setWalkInName}
        walkInPhone={walkInPhone}
        setWalkInPhone={setWalkInPhone}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        customerResults={customerResults}
        setCustomerResults={setCustomerResults}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        isSearchingCustomer={isSearchingCustomer}
        onOpenNewCustomer={() => setIsNewCustomerModalOpen(true)}
        subtotal={subtotal}
        grandTotal={grandTotal}
        discount={discount}
        setDiscount={setDiscount}
        amountPaid={amountPaid}
        setAmountPaid={setAmountPaid}
        pendingAmount={pendingAmount}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        orderStatus={orderStatus}
        setOrderStatus={setOrderStatus}
        cartCount={cart.length}
        isOnline={isOnline}
        isSubmitting={isSubmitting}
        disabledReason={disabledReason}
      />

      {/* 🟢 POS ORDER SUCCESS & THERMAL PRINT OVERLAY */}
      <OrderSuccessModal
        order={completedOrderData}
        onClose={() => setCompletedOrderData(null)}
        onViewOrder={(id) => router.push(`/orders/${id}`)}
      />

      {/* 🟢 INTERRUPT MODAL — create customer without losing cart state */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onCreated={(customer) => {
          setSelectedCustomer(customer);
          setCustomerMode("existing");
          setCustomerSearch("");
          setCustomerResults([]);
        }}
      />
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
