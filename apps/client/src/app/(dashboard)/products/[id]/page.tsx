"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  MapPin,
  Clock,
  Archive,
  BarChart2,
  Tag,
  Warehouse,
  Barcode,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Pencil,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import EditProductModal from "@/components/modals/EditProductModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  if (val === null || val === undefined) return "0";
  const num = Number(val);
  return (isNaN(num) ? 0 : num).toLocaleString();
};

type Instance = {
  id: string;
  branch: { id: string; name: string };
  cabinet?: { id: string; name: string };
};

type Movement = {
  id: string;
  createdAt: string;
  quantity: number;
  direction: string;
  referenceType: string;
  notes: string;
  vendor?: { businessName: string };
  cabinet?: { name: string };
};

type SaleItem = {
  id: string;
  orderId: string;
  orderNumber: number;
  createdAt: string;
  quantity: number;
  price: number;
  total: number;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone?: string | null;
  branchName: string;
  creatorName?: string | null;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  stock: number;
  totalSold?: number;
  totalRevenue?: number;
  category?: { name: string };
  defaultCostPrice?: number | string | null;
  partNumber?: string | null;
  aliases?: string[] | null;
  compatibleWith?: string[] | null;
  minSalePrice?: number | string | null;
  lowStockThreshold?: number | string | null;
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"location" | "sales" | "audit">(
    "location",
  );

  const { hasPermission } = usePermissions();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchDetails = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/product/${id}/details`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setProduct(data.product);
        const instList = data.instances || [];
        const saleList = data.sales || [];
        setInstances(instList);
        setMovements(data.movements || []);
        setSales(saleList);
        if (instList.length === 0 && saleList.length > 0) {
          setActiveTab("sales");
        }
      }
    } catch (err) {
      console.error("Failed to load product details", err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) void fetchDetails();
  }, [id, fetchDetails]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <BarChart2 className="mr-2 h-5 w-5 animate-pulse" />
        <span className="text-body">Loading product...</span>
      </div>
    );
  }

  if (!product) {
    return <div className="p-6 text-center text-body text-gray-500">Product not found.</div>;
  }

  // Group instances by Branch -> Cabinet
  const locationBreakdown: Record<string, Record<string, number>> = {};
  instances.forEach((inst) => {
    const branchName = inst.branch.name;
    const cabinetName = inst.cabinet?.name || "No Cabinet";

    if (!locationBreakdown[branchName]) {
      locationBreakdown[branchName] = {};
    }
    locationBreakdown[branchName][cabinetName] =
      (locationBreakdown[branchName][cabinetName] || 0) + 1;
  });

  return (
    <div className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => router.back()}
          aria-label="Back to products"
          title="Back"
          className="mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          title={product.name}
          subtitle="Product details & performance"
          actions={
            hasPermission("write:products") ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="product-edit"
                onClick={() => setIsEditOpen(true)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null
          }
        />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-600">
              <Package className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                In Stock
              </p>
              <p className="text-title font-semibold text-gray-900">
                {product.stock}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-600">
              <Tag className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Base Price
              </p>
              <p className="truncate text-title font-semibold text-gray-900">
                Rs. {formatPrice(product.basePrice)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-brand-50 p-1.5 text-brand-700">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Total Sold
              </p>
              <p className="text-title font-semibold text-gray-900">
                {product.totalSold || 0}{" "}
                <span className="text-caption font-medium text-gray-500">
                  units
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-success-bg p-1.5 text-success">
              <DollarSign className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Sales Revenue
              </p>
              <p className="truncate text-title font-semibold text-success">
                Rs. {formatPrice(product.totalRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-600">
              <Archive className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Category
              </p>
              <div className="min-w-0 truncate">
                <Badge variant="neutral">
                  {product.category?.name || "Uncategorized"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-600">
              <Barcode className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                SKU
              </p>
              <p className="truncate font-mono text-body font-semibold text-gray-900">
                {product.sku}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={activeTab === "location" ? "primary" : "secondary"}
          onClick={() => setActiveTab("location")}
        >
          <MapPin className="h-3.5 w-3.5" />
          Location Breakdown
        </Button>
        <Button
          size="sm"
          variant={activeTab === "sales" ? "primary" : "secondary"}
          onClick={() => setActiveTab("sales")}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Sales History
          <Badge variant={activeTab === "sales" ? "brand" : "neutral"}>
            {sales.length}
          </Badge>
        </Button>
        <Button
          size="sm"
          variant={activeTab === "audit" ? "primary" : "secondary"}
          onClick={() => setActiveTab("audit")}
        >
          <Clock className="h-3.5 w-3.5" />
          Audit Trail
        </Button>
      </div>

      {/* Tab content */}
      <Card className="flex-1 overflow-hidden">
        {activeTab === "location" && (
          <div className="space-y-3 p-3">
            {Object.keys(locationBreakdown).length === 0 ? (
              <div className="py-10 text-center text-body text-gray-500">
                <Warehouse className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p>No available physical instances across any branch.</p>
              </div>
            ) : (
              Object.entries(locationBreakdown).map(
                ([branch, cabinets]: [string, any]) => (
                  <div
                    key={branch}
                    className="overflow-hidden rounded-md border border-border"
                  >
                    <div className="flex items-center gap-2 border-b border-border bg-gray-50 px-3 py-2">
                      <MapPin className="h-4 w-4 text-brand-700" />
                      <h3 className="text-body font-semibold text-gray-900">
                        {branch}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(cabinets).map(
                        ([cabinet, qty]: [string, any]) => (
                          <div
                            key={cabinet}
                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                          >
                            <span className="truncate text-body font-medium text-gray-700">
                              {cabinet}
                            </span>
                            <Badge variant="neutral" className="shrink-0">
                              {qty} units
                            </Badge>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        )}

        {activeTab === "sales" && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date & Time</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-center">Qty Sold</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
                <TableHead className="text-center">Order Status</TableHead>
                <TableHead className="text-center">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableEmpty colSpan={9}>
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-body font-semibold text-gray-700">
                    No sales recorded yet
                  </p>
                  <p className="mt-0.5 text-caption text-gray-500">
                    This product has not been sold in any orders yet.
                  </p>
                </TableEmpty>
              ) : (
                sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-caption text-gray-600">
                      {new Date(s.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${s.orderId}`}
                        className="text-caption font-semibold text-brand-700 hover:underline"
                      >
                        #{s.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="text-body font-medium text-gray-900">
                        {s.customerName}
                      </p>
                      {s.customerPhone && (
                        <p className="font-mono text-caption text-gray-500">
                          {s.customerPhone}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{s.branchName}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-body font-semibold text-gray-900">
                        {s.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-body text-gray-700">
                      Rs. {formatPrice(s.price)}
                    </TableCell>
                    <TableCell className="text-right text-body font-semibold text-success">
                      Rs. {formatPrice(s.total)}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.status === "FINAL" || s.status === "COMPLETED" ? (
                        <Badge variant="success" uppercase>{s.status}</Badge>
                      ) : s.status === "MEMO" || s.status === "PENDING" ? (
                        <Badge variant="warning" uppercase>{s.status}</Badge>
                      ) : s.status === "CANCELLED" ? (
                        <Badge variant="danger" uppercase>{s.status}</Badge>
                      ) : (
                        <Badge variant="neutral" uppercase>{s.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          s.paymentStatus === "PAID"
                            ? "success"
                            : s.paymentStatus === "PARTIAL"
                              ? "warning"
                              : "danger"
                        }
                        uppercase
                      >
                        {s.paymentStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {activeTab === "audit" && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Location / Vendor</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableEmpty colSpan={5}>No movement history.</TableEmpty>
              ) : (
                movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-caption text-gray-600">
                      {new Date(m.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.direction === "IN" ? "success" : "danger"}
                      >
                        {m.direction} - {m.referenceType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-body font-semibold text-gray-900">
                      {m.direction === "IN" ? "+" : "-"}
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-body text-gray-700">
                      {m.referenceType === "RESTOCK"
                        ? m.vendor?.businessName || "Unknown Vendor"
                        : m.cabinet?.name || "N/A"}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-body text-gray-500"
                      title={m.notes || ""}
                    >
                      {m.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {hasPermission("write:products") && (
        <EditProductModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          product={product}
          onSaved={fetchDetails}
        />
      )}
    </div>
  );
}
