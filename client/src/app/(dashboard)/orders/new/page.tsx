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
  MapPin,
  Wrench,
  X,
  User,
  Phone,
  Store,
  LayoutGrid,
  List,
  GripVertical,
} from "lucide-react";
import { offlineDb, type SyncQueueItem } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { generateWhatsAppReceipt } from "@/lib/utils";
import OrderSuccessModal, {
  type CompletedOrderData,
} from "@/components/modals/OrderSuccessModal";
import NewCustomerModal from "@/components/modals/NewCustomerModal";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";

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
  const { user } = useAuth();

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
  const handleCompleteOrder = async (
    statusOverride?: string | React.MouseEvent,
  ) => {
    setIsSubmitting(true);
    setOfflineSuccessMsg("");

    const currentCart = [...cart];
    const currentCustomer = selectedCustomer;
    const currentDiscount = Number(discount);
    const currentPaid = Number(amountPaid);
    const currentStatus =
      typeof statusOverride === "string" ? statusOverride : orderStatus;

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
          if (ci.isService) continue;
          const cachedProd = await offlineDb.products.get(ci.id);
          if (cachedProd) {
            await offlineDb.products.update(ci.id, {
              stock: Math.max(0, cachedProd.stock - ci.qty),
            });
          }
        }

        // Update local React state (including instances to keep available count in sync)
        setProducts((prev) =>
          prev.map((p) => {
            const inCart = cart.find((ci) => ci.id === p.id);
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

        setOfflineSuccessMsg(
          `Offline Intercept: ${orderStatus === "MEMO" ? "MEMO (Amanat)" : "FINAL Sale"} Order (#${localOrderId.slice(0, 8)}) safely queued in IndexedDB. Stock reserved. Will auto-sync when network returns.`,
        );
        setCart([]);
        setAmountPaid("");
        setDiscount("");
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

      setCart([]);
      setAmountPaid("");
      setDiscount("");
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
        setDiscount("");
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
    [products],
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
    setIsServiceFormOpen(false);
    setServiceName("");
    setServicePrice("");
    setServiceNotes("");
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
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : item;
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
          const safeQty = Math.max(1, isNaN(qty) ? 1 : qty);
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

  // 🟢 RESIZABLE COLUMNS WITH LOCALSTORAGE MEMORY
  const [colWidths, setColWidths] = useState({
    col1: 390, // Catalog / Products
    col2: 360, // Unified Cart
    col3: 380, // Customer & Checkout
  });
  const [activeResizeCol, setActiveResizeCol] = useState<
    "col1" | "col2" | "col3" | null
  >(null);
  const isDraggingRef = useRef<"col1" | "col2" | "col3" | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("deepkhata_pos_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.col1 && parsed.col2 && parsed.col3) {
          setColWidths(parsed);
        }
      }
    } catch {}
  }, []);

  const handleMouseDown = (
    col: "col1" | "col2" | "col3",
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    isDraggingRef.current = col;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = colWidths[col];
    setActiveResizeCol(col);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const activeCol = isDraggingRef.current;
      if (!activeCol) return;
      const delta = e.clientX - dragStartXRef.current;

      let minW = 280;
      let maxW = 850;
      if (activeCol === "col1") {
        minW = 280;
        maxW = 850;
      } else if (activeCol === "col2") {
        minW = 280;
        maxW = 800;
      } else if (activeCol === "col3") {
        minW = 340;
        maxW = 650;
      }

      const newWidth = Math.max(
        minW,
        Math.min(maxW, dragStartWidthRef.current + delta),
      );

      setColWidths((prev) => {
        const updated = { ...prev, [activeCol]: newWidth };
        try {
          localStorage.setItem("deepkhata_pos_widths", JSON.stringify(updated));
        } catch {}
        return updated;
      });
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = null;
        setActiveResizeCol(null);
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

  const resetColWidths = () => {
    const defaults = { col1: 390, col2: 360, col3: 380 };
    setColWidths(defaults);
    try {
      localStorage.setItem("deepkhata_pos_widths", JSON.stringify(defaults));
    } catch {}
  };

  const disabledReason = getDisabledReason();
  const isCheckoutDisabled = Boolean(disabledReason) || isSubmitting;

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
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sync {pendingCount} Pending</span>
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
            className="text-slate-400 hover:text-slate-700 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================
          THREE-COLUMN RESIZABLE LAYOUT WITH HORIZONTAL SCROLL
          Side-by-side columns: Catalog | Cart | Checkout
      ==================================================== */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden mt-3 min-h-0 pb-1.5 pos-horizontal-scroll">
        <div className="flex flex-row items-stretch h-full gap-1 min-w-max">
          {/* ───────── LEFT COLUMN: PRODUCT CATALOG ───────── */}
          <div
            style={{ width: `${colWidths.col1}px` }}
            className="flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 shrink-0 min-w-[280px]"
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

          {/* RESIZE HANDLE 1 (Catalog / Cart) */}
          <div
            onMouseDown={(e) => handleMouseDown("col1", e)}
            onDoubleClick={resetColWidths}
            style={{ cursor: "col-resize" }}
            className={`relative w-4 -mx-2 flex flex-col items-center justify-center select-none z-20 shrink-0 group ${
              activeResizeCol === "col1"
                ? "bg-blue-100/40"
                : "hover:bg-blue-50/50"
            } transition-colors`}
          >
            {/* Full-height visible divider track */}
            <div
              className={`w-[2px] h-full transition-all duration-150 ${
                activeResizeCol === "col1"
                  ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                  : "bg-slate-200 group-hover:bg-blue-400"
              }`}
              style={{ cursor: "col-resize" }}
            />

            {/* Centered tactile grip pill */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-9 rounded-full border flex items-center justify-center transition-all duration-150 shadow-sm pointer-events-none ${
                activeResizeCol === "col1"
                  ? "bg-blue-600 border-blue-700 text-white scale-110 shadow-md"
                  : "bg-white border-slate-300 text-slate-400 group-hover:border-blue-400 group-hover:text-blue-600 group-hover:scale-105 group-hover:shadow"
              }`}
              style={{ cursor: "col-resize" }}
            >
              <GripVertical className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* ───────── CENTER COLUMN: UNIFIED CART ───────── */}
          <div
            style={{ width: `${colWidths.col2}px` }}
            className="flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 shrink-0 min-w-[280px]"
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
                      {user?.role !== "STAFF" && (
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
                            if (isNaN(val) || val < 1) {
                              setDirectQty(item.id, item.condition, 1);
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
          </div>

          {/* RESIZE HANDLE 2 (Cart / Checkout) */}
          <div
            onMouseDown={(e) => handleMouseDown("col2", e)}
            onDoubleClick={resetColWidths}
            style={{ cursor: "col-resize" }}
            className={`relative w-4 -mx-2 flex flex-col items-center justify-center select-none z-20 shrink-0 group ${
              activeResizeCol === "col2"
                ? "bg-blue-100/40"
                : "hover:bg-blue-50/50"
            } transition-colors`}
          >
            {/* Full-height visible divider track */}
            <div
              className={`w-[2px] h-full transition-all duration-150 ${
                activeResizeCol === "col2"
                  ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                  : "bg-slate-200 group-hover:bg-blue-400"
              }`}
              style={{ cursor: "col-resize" }}
            />

            {/* Centered tactile grip pill */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-9 rounded-full border flex items-center justify-center transition-all duration-150 shadow-sm pointer-events-none ${
                activeResizeCol === "col2"
                  ? "bg-blue-600 border-blue-700 text-white scale-110 shadow-md"
                  : "bg-white border-slate-300 text-slate-400 group-hover:border-blue-400 group-hover:text-blue-600 group-hover:scale-105 group-hover:shadow"
              }`}
              style={{ cursor: "col-resize" }}
            >
              <GripVertical className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* ───────── RIGHT COLUMN: CHECKOUT PANEL ───────── */}
          <div
            style={{ width: `${colWidths.col3}px` }}
            className="flex flex-col overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 shrink-0 min-w-[340px]"
          >
            {/* CUSTOMER SEGMENT */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-2.5">
                <User className="w-4 h-4 text-slate-500" /> Customer
              </h2>
              <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                <button
                  onClick={() => {
                    setCustomerMode("walk-in");
                    setSelectedCustomer(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${customerMode === "walk-in" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Walk-in
                </button>
                <button
                  onClick={() => setCustomerMode("existing")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${customerMode === "existing" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Existing / Search
                </button>
              </div>

              {customerMode === "walk-in" && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Customer Name (Optional)"
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 font-medium placeholder-slate-400 shadow-2xs"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Phone Number (Optional)"
                      value={walkInPhone}
                      onChange={(e) => setWalkInPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 font-medium placeholder-slate-400 font-mono shadow-2xs"
                    />
                  </div>
                </div>
              )}

              {customerMode === "existing" && (
                <div className="mt-3 relative">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-blue-900 truncate flex items-center gap-1">
                          {selectedCustomer.shopName && (
                            <Store className="w-3 h-3 text-blue-500 shrink-0" />
                          )}
                          {selectedCustomer.name}
                        </p>
                        <p className="text-[10px] text-blue-600 truncate">
                          {selectedCustomer.phone}
                          {selectedCustomer.shopName
                            ? ` · ${selectedCustomer.shopName}`
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="text-xs text-blue-600 hover:text-rose-600 font-bold shrink-0 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Type name or phone..."
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-2xs"
                          />
                        </div>
                        <button
                          onClick={() => setIsNewCustomerModalOpen(true)}
                          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shrink-0 shadow-xs cursor-pointer"
                          title="Create new customer"
                        >
                          + New
                        </button>
                      </div>
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
                              className="w-full text-left p-2.5 hover:bg-slate-50 border-b border-slate-50 text-xs flex justify-between cursor-pointer"
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

            {/* CHECKOUT SEGMENT */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {/* Discount */}
              <div className="flex items-center justify-between bg-slate-50/70 p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Tag className="w-4 h-4 text-slate-500" />
                  <span>Discount</span>
                </label>
                <div className="relative w-28 sm:w-32">
                  <span className="text-xs font-bold text-slate-400 absolute left-2.5 top-2 pointer-events-none">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onFocus={(e) => {
                      if (discount === "0" || Number(discount) === 0)
                        setDiscount("");
                      e.target.select();
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setDiscount("");
                      } else {
                        setDiscount(String(Math.max(0, Number(val))));
                      }
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 text-right font-black text-slate-900 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex items-end justify-between">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                  Grand Total
                </span>
                <span className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                  Rs. {grandTotal.toLocaleString()}
                </span>
              </div>

              <hr className="border-slate-200" />

              {/* Payment */}
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Amount Received
                      </label>
                      {pendingAmount > 0 && cart.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmountPaid(grandTotal.toString())}
                          className="text-blue-600 hover:text-blue-800 font-bold text-[11px] hover:underline cursor-pointer"
                        >
                          Pay in Full
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="number"
                        min="0"
                        value={amountPaid}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        placeholder="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="w-32 shrink-0">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-2xs cursor-pointer"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank</option>
                    </select>
                  </div>
                </div>

                {/* MEMO / FINAL toggle */}
                {customerMode === "existing" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Order Status (Dual State Logic)
                    </label>
                    <div className="flex relative">
                      <button
                        onClick={() => setOrderStatus("FINAL")}
                        className={`flex-1 py-2 px-2 rounded-l-lg text-xs font-bold transition-colors cursor-pointer ${
                          orderStatus === "FINAL"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        FINAL Sale
                      </button>
                      <button
                        onClick={() => setOrderStatus("MEMO")}
                        className={`flex-1 py-2 px-2 rounded-r-lg text-xs font-bold transition-colors cursor-pointer ${
                          orderStatus === "MEMO"
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        MEMO / Amanat
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SUBMIT */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-2">
              {disabledReason && cart.length > 0 && (
                <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>{disabledReason}</span>
                </div>
              )}

              <button
                onClick={() => handleCompleteOrder()}
                disabled={isCheckoutDisabled}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
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

              <button
                onClick={() => handleCompleteOrder("ESTIMATE")}
                disabled={isCheckoutDisabled}
                className="w-full py-3 bg-white text-slate-700 border border-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
              >
                Save as Estimate
              </button>
            </div>
          </div>

          {/* RESIZE HANDLE 3 (Checkout width) */}
          <div
            onMouseDown={(e) => handleMouseDown("col3", e)}
            onDoubleClick={resetColWidths}
            style={{ cursor: "col-resize" }}
            className={`relative w-4 -mx-2 flex flex-col items-center justify-center select-none z-20 shrink-0 group ${
              activeResizeCol === "col3"
                ? "bg-blue-100/40"
                : "hover:bg-blue-50/50"
            } transition-colors`}
          >
            {/* Full-height visible divider track */}
            <div
              className={`w-[2px] h-full transition-all duration-150 ${
                activeResizeCol === "col3"
                  ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                  : "bg-slate-200 group-hover:bg-blue-400"
              }`}
              style={{ cursor: "col-resize" }}
            />

            {/* Centered tactile grip pill */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-9 rounded-full border flex items-center justify-center transition-all duration-150 shadow-sm pointer-events-none ${
                activeResizeCol === "col3"
                  ? "bg-blue-600 border-blue-700 text-white scale-110 shadow-md"
                  : "bg-white border-slate-300 text-slate-400 group-hover:border-blue-400 group-hover:text-blue-600 group-hover:scale-105 group-hover:shadow"
              }`}
              style={{ cursor: "col-resize" }}
            >
              <GripVertical className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
      </div>

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
