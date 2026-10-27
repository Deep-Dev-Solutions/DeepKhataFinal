"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Phone,
  MapPin,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  CheckCircle2,
  Package,
  Layers,
  Clock,
  Tag,
  ExternalLink,
  Search,
  DollarSign,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Warehouse,
  Loader2,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const splitDateTime = (value: string): [string, string] => {
  const idx = value.lastIndexOf(", ");
  return idx === -1 ? [value, ""] : [value.slice(0, idx), value.slice(idx + 2)];
};

const formatPrice = (val: any): string => {
  if (val === null || val === undefined) return "0";
  const num = Number(val);
  return (isNaN(num) ? 0 : num).toLocaleString();
};

export default function VendorProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [vendor, setVendor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Transaction form states
  const [actionType, setActionType] = useState<"purchase" | "payment">(
    "purchase",
  );
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txError, setTxError] = useState("");
  const [txSuccess, setTxSuccess] = useState("");

  // Tab & search states
  const [activeTab, setActiveTab] = useState<
    "products" | "inventory" | "ledger" | "movements"
  >("products");
  const [itemSearch, setItemSearch] = useState("");

  const fetchVendorData = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/vendors/${id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to load vendor profile");
      }

      const formattedLedger = (data.vendor.ledger || []).map((item: any) => ({
        ...item,
        formattedDate: new Date(item.date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      setVendor({
        ...data.vendor,
        ledger: formattedLedger,
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load vendor profile",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void fetchVendorData();
    }
  }, [id, fetchVendorData]);

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTx(true);
    setTxError("");
    setTxSuccess("");

    try {
      const endpoint =
        actionType === "purchase"
          ? `/vendors/${id}/purchase`
          : `/vendors/${id}/payment`;
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: Number(txAmount),
          description: txDescription,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || `Failed to record ${actionType}`,
        );
      }

      setTxAmount("");
      setTxDescription("");
      setTxSuccess(
        actionType === "purchase"
          ? "Stock purchase recorded to ledger."
          : "Vendor payment recorded successfully.",
      );
      setTimeout(() => setTxSuccess(""), 4000);
      await fetchVendorData();
    } catch (error) {
      setTxError(
        error instanceof Error ? error.message : "Failed to record transaction",
      );
    } finally {
      setIsSubmittingTx(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
          <p className="text-body font-medium">Loading vendor profile...</p>
        </div>
      </div>
    );
  }

  if (pageError || !vendor) {
    return (
      <div className="mx-auto mt-10 max-w-md p-6 text-center">
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-bg p-3 text-body text-danger-fg">
          {pageError || "Vendor not found"}
        </div>
        <Link
          href="/vendors"
          className="font-semibold text-brand-700 hover:underline"
        >
          &larr; Back to Vendors
        </Link>
      </div>
    );
  }

  const metrics = vendor.metrics || {};
  const products: any[] = vendor.products || [];
  const suppliedInventory: any[] = vendor.suppliedInventory || [];
  const movements: any[] = vendor.movements || [];

  const filteredProducts = products.filter((p) => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return (
      p.productName.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const filteredInventory = suppliedInventory.filter((item) => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return (
      item.productName.toLowerCase().includes(q) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.branchName && item.branchName.toLowerCase().includes(q))
    );
  });

  return (
    <div data-testid="vendor-detail" className="mt-1 flex flex-col gap-3 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <Card>
        <CardContent className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Link
              href="/vendors"
              aria-label="Back to vendors"
              className={buttonVariants({ variant: "secondary", size: "icon" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title font-semibold text-gray-900">
                  {vendor.businessName}
                </h1>
                {vendor.balance > 0 ? (
                  <Badge variant="danger">
                    Owe Rs. {formatPrice(vendor.balance)}
                  </Badge>
                ) : (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" /> Settled
                  </Badge>
                )}
              </div>
              <p className="text-caption text-gray-500">
                Supplier &amp; vendor profile
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="vendor-purchase-open"
              onClick={() => {
                setActionType("purchase");
                const el = document.getElementById("tx-form");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Record Purchase
            </Button>
            <Button
              size="sm"
              data-testid="vendor-payment-open"
              onClick={() => {
                setActionType("payment");
                const el = document.getElementById("tx-form");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="shrink-0 rounded-md bg-brand-50 p-1.5 text-brand-700">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Total Purchases"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Purchases
              </p>
              <p className="truncate text-body font-semibold text-gray-900">
                Rs. {formatPrice(metrics.totalPurchases)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="shrink-0 rounded-md bg-success-bg p-1.5 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Total Paid"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Paid
              </p>
              <p className="truncate text-body font-semibold text-success">
                Rs. {formatPrice(metrics.totalPaid)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div
              className={`shrink-0 rounded-md p-1.5 ${
                vendor.balance > 0
                  ? "bg-danger-bg text-danger"
                  : "bg-success-bg text-success"
              }`}
            >
              <Wallet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Balance Due"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Balance
              </p>
              <p
                data-testid="vendor-balance"
                className={`truncate text-body font-semibold ${
                  vendor.balance > 0 ? "text-danger" : "text-success"
                }`}
              >
                Rs. {formatPrice(vendor.balance)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-500">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Units Supplied"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Units
              </p>
              <p className="text-body font-semibold text-gray-900">
                {metrics.totalUnitsSupplied || 0}{" "}
                <span className="text-caption font-normal text-gray-400">
                  units
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-500">
              <Tag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Catalog Items"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Items
              </p>
              <p className="text-body font-semibold text-gray-900">
                {metrics.distinctProductsCount || products.length}{" "}
                <span className="text-caption font-normal text-gray-400">
                  prods
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-500">
              <Warehouse className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                title="Stock Status"
                className="truncate text-caption font-medium uppercase tracking-wide text-gray-500"
              >
                Stock
              </p>
              <p className="truncate text-caption font-semibold text-gray-900">
                <span className="text-success">
                  {metrics.availableUnits || 0} in stock
                </span>
                <span className="text-gray-400"> · </span>
                <span className="text-gray-500">
                  {metrics.soldUnits || 0} sold
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col items-start gap-3 lg:flex-row">
        {/* Left Column: Vendor Info & Transaction Form */}
        <div
          className="flex w-full shrink-0 flex-col gap-3 lg:w-[336px]"
          id="tx-form"
        >
          {/* Vendor Info Card */}
          <Card>
            <CardHeader className="border-b border-border bg-gray-50 px-4 py-2">
              <CardTitle className="text-caption font-semibold uppercase tracking-wide text-gray-600">
                Vendor Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 py-3 text-body">
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">
                    {vendor.contactName || "Not provided"}
                  </p>
                  <p className="text-caption text-gray-500">Contact person</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-caption font-semibold text-gray-900">
                    {vendor.phone || "Not provided"}
                  </p>
                  <p className="text-caption text-gray-500">Phone number</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 border-t border-border pt-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-caption font-medium leading-relaxed text-gray-700">
                    {vendor.address || "Not provided"}
                  </p>
                  <p className="text-caption text-gray-500">Address</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Record Transaction Card (Purchase / Payment) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border bg-gray-50 px-4 py-2">
              <CardTitle className="whitespace-nowrap text-caption font-semibold uppercase tracking-wide text-gray-600">
                Ledger Entry
              </CardTitle>
              <div className="flex items-center gap-1 rounded-md bg-gray-100 p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={actionType === "purchase" ? "secondary" : "ghost"}
                  className="h-6 px-2 text-caption"
                  onClick={() => setActionType("purchase")}
                >
                  Purchase
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={actionType === "payment" ? "secondary" : "ghost"}
                  className="h-6 px-2 text-caption"
                  onClick={() => setActionType("payment")}
                >
                  Payment
                </Button>
              </div>
            </CardHeader>

            <CardContent className="px-4 py-3">
              <form onSubmit={handleRecordTransaction} className="space-y-3">
                {txError && (
                  <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-caption font-medium text-danger-fg">
                    {txError}
                  </div>
                )}
                {txSuccess && (
                  <div className="rounded-md border border-success/30 bg-success-bg px-3 py-2 text-caption font-medium text-success-fg">
                    {txSuccess}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    {actionType === "purchase"
                      ? "Purchase amount (Rs.) *"
                      : "Payment amount to vendor (Rs.) *"}
                  </label>
                  <Input
                    type="number"
                    required
                    min="1"
                    data-testid="vendor-amount"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Description / reference note
                  </label>
                  <Input
                    type="text"
                    data-testid="vendor-description"
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    placeholder={
                      actionType === "purchase"
                        ? "e.g. OLED screens batch #12"
                        : "e.g. Cash settlement for invoice"
                    }
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="vendor-submit"
                  disabled={isSubmittingTx || !txAmount}
                  loading={isSubmittingTx}
                  className="w-full"
                >
                  {!isSubmittingTx && <Plus className="h-4 w-4" />}
                  {isSubmittingTx
                    ? "Recording..."
                    : actionType === "purchase"
                      ? "Add Purchase to Ledger"
                      : "Record Payment (Settle)"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Section: Multi-tab content */}
        <Card className="flex w-full flex-1 flex-col overflow-hidden">
          {/* Tabs bar */}
          <div className="flex flex-col justify-between gap-3 border-b border-border bg-gray-50 px-3 py-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant={activeTab === "products" ? "secondary" : "ghost"}
                onClick={() => setActiveTab("products")}
              >
                <Package className="h-3.5 w-3.5" /> Products
                <Badge variant={activeTab === "products" ? "brand" : "neutral"}>
                  {products.length}
                </Badge>
              </Button>

              <Button
                size="sm"
                variant={activeTab === "inventory" ? "secondary" : "ghost"}
                onClick={() => setActiveTab("inventory")}
              >
                <Layers className="h-3.5 w-3.5" /> Batches
                <Badge
                  variant={activeTab === "inventory" ? "brand" : "neutral"}
                >
                  {suppliedInventory.length}
                </Badge>
              </Button>

              <Button
                size="sm"
                variant={activeTab === "ledger" ? "secondary" : "ghost"}
                onClick={() => setActiveTab("ledger")}
              >
                <Wallet className="h-3.5 w-3.5" /> Ledger
                <Badge variant={activeTab === "ledger" ? "brand" : "neutral"}>
                  {vendor.ledger?.length || 0}
                </Badge>
              </Button>

              <Button
                size="sm"
                variant={activeTab === "movements" ? "secondary" : "ghost"}
                onClick={() => setActiveTab("movements")}
              >
                <Clock className="h-3.5 w-3.5" /> Audit Logs
                <Badge
                  variant={activeTab === "movements" ? "brand" : "neutral"}
                >
                  {movements.length}
                </Badge>
              </Button>
            </div>

            {(activeTab === "products" || activeTab === "inventory") && (
              <div className="relative w-full sm:w-44">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  size="sm"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Filter items..."
                  className="pl-8"
                />
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            {/* TAB 1: PRODUCTS PURCHASED (CATALOG VIEW) */}
            {activeTab === "products" && (
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product</TableHead>
                    <TableHead>Category / SKU</TableHead>
                    <TableHead className="text-center">Sourced</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="w-12 text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableEmpty colSpan={7}>
                      <EmptyState
                        className="border-0 bg-transparent py-4 shadow-none"
                        icon={Package}
                        title="No products found from this vendor"
                        description="Products attached to this vendor during creation or restock will appear here."
                      />
                    </TableEmpty>
                  ) : (
                    filteredProducts.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell>
                          <Link
                            href={`/products/${p.productId}`}
                            className="block text-body font-semibold text-gray-900 transition-colors hover:text-brand-700 hover:underline"
                          >
                            {p.productName}
                          </Link>
                          {p.branches?.length > 0 && (
                            <span
                              title={p.branches.join(", ")}
                              className="block max-w-56 truncate text-caption text-gray-400"
                            >
                              {p.branches.join(" · ")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="neutral">{p.category}</Badge>
                            {p.sku && (
                              <span className="font-mono text-caption text-gray-400">
                                {p.sku}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="neutral">{p.totalQuantity} units</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {p.availableQuantity > 0 ? (
                            <Badge variant="success">
                              {p.availableQuantity} available
                            </Badge>
                          ) : (
                            <Badge variant="neutral">0 available</Badge>
                          )}
                          {p.soldQuantity > 0 && (
                            <span className="mt-0.5 block text-caption text-gray-400">
                              {p.soldQuantity} sold
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-caption font-medium text-gray-700">
                          {p.avgUnitCost > 0
                            ? `Rs. ${formatPrice(p.avgUnitCost)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold text-gray-900">
                          {p.totalCost > 0
                            ? `Rs. ${formatPrice(p.totalCost)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Link
                            href={`/products/${p.productId}`}
                            className="inline-block rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-700"
                            title="View product details"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* TAB 2: SUPPLIED INVENTORY BATCHES */}
            {activeTab === "inventory" && (
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Received</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Branch & Cabinet</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Batch Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableEmpty colSpan={7}>
                      <EmptyState
                        className="border-0 bg-transparent py-4 shadow-none"
                        icon={Layers}
                        title="No inventory batches found"
                        description="Physical product instances sourced from this vendor will appear here."
                      />
                    </TableEmpty>
                  ) : (
                    filteredInventory.map((item: any) => (
                      <TableRow key={item.key}>
                        <TableCell className="text-caption font-medium text-gray-500">
                          {new Date(item.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/products/${item.productId}`}
                            className="block text-body font-semibold text-gray-800 transition-colors hover:text-brand-700 hover:underline"
                          >
                            {item.productName}
                          </Link>
                          {item.sku && (
                            <span className="font-mono text-caption text-gray-400">
                              {item.sku}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="block text-caption font-medium text-gray-700">
                            {item.branchName}
                          </span>
                          <span className="text-caption text-gray-400">
                            {item.cabinetName}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="neutral">{item.quantity} units</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              item.availableCount > 0 ? "success" : "neutral"
                            }
                          >
                            {item.availableCount} avail
                          </Badge>
                          {item.soldCount > 0 && (
                            <span className="block text-caption text-gray-400">
                              {item.soldCount} sold
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-caption font-medium text-gray-700">
                          {item.unitCost !== null && item.unitCost !== undefined
                            ? `Rs. ${formatPrice(item.unitCost)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold text-gray-900">
                          {item.totalCost > 0
                            ? `Rs. ${formatPrice(item.totalCost)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* TAB 3: LEDGER (ACCOUNTS PAYABLE) */}
            {activeTab === "ledger" && (
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right" title="Credit (We Owe)">
                      Credit
                    </TableHead>
                    <TableHead className="text-right" title="Debit (We Paid)">
                      Debit
                    </TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!vendor.ledger || vendor.ledger.length === 0 ? (
                    <TableEmpty colSpan={6}>
                      <EmptyState
                        className="border-0 bg-transparent py-4 shadow-none"
                        icon={Wallet}
                        title="No ledger transactions found"
                        description="Record a credit purchase or payment on the left to start tracking payables."
                      />
                    </TableEmpty>
                  ) : (
                    vendor.ledger.map((item: any) => (
                      <TableRow data-testid="vendor-ledger-row" key={item.id}>
                        <TableCell className="align-top">
                          <span className="block whitespace-nowrap text-caption font-medium text-gray-600">
                            {splitDateTime(item.formattedDate)[0]}
                          </span>
                          <span className="block whitespace-nowrap text-caption text-gray-400">
                            {splitDateTime(item.formattedDate)[1]}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-48">
                          <p
                            title={item.description}
                            className="truncate text-body font-medium text-gray-800"
                          >
                            {item.description}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.type === "VENDOR_PAYMENT"
                                ? "success"
                                : "brand"
                            }
                          >
                            {item.type === "VENDOR_PAYMENT"
                              ? "PAYMENT"
                              : "PURCHASE"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {item.credit > 0 ? (
                            <span className="font-semibold text-danger">
                              Rs. {formatPrice(item.credit)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {item.debit > 0 ? (
                            <span className="font-semibold text-success">
                              Rs. {formatPrice(item.debit)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold text-gray-900">
                          Rs. {formatPrice(item.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* TAB 4: AUDIT LOGS */}
            {activeTab === "movements" && (
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Cabinet</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableEmpty colSpan={6}>
                      <EmptyState
                        className="border-0 bg-transparent py-4 shadow-none"
                        icon={Clock}
                        title="No movement logs"
                        description="Stock movements for this vendor will appear here."
                      />
                    </TableEmpty>
                  ) : (
                    movements.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-caption text-gray-600">
                          {new Date(m.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-body font-semibold text-gray-800">
                          {m.product?.name || "Product"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={m.direction === "IN" ? "success" : "danger"}
                          >
                            {m.direction} · {m.referenceType}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-center font-semibold ${
                            m.direction === "IN" ? "text-success" : "text-danger"
                          }`}
                        >
                          {m.direction === "IN" ? "+" : "-"}
                          {m.quantity}
                        </TableCell>
                        <TableCell className="text-caption text-gray-600">
                          {m.cabinet?.name || "-"}
                        </TableCell>
                        <TableCell className="max-w-48">
                          <span
                            title={m.notes || "-"}
                            className="block truncate text-caption text-gray-500"
                          >
                            {m.notes || "-"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
