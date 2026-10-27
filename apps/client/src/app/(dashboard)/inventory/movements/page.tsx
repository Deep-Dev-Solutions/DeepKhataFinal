"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  MapPin,
  Truck,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

type Movement = {
  id: string;
  productId: string;
  cabinetId: string | null;
  quantity: number;
  direction: "IN" | "OUT" | "TRANSFER";
  referenceType: string;
  referenceId: string;
  notes: string | null;
  createdAt: string;
  product: { name: string; sku: string | null };
  cabinet: { name: string; location: string | null } | null;
  user: { name: string };
  vendor: { businessName: string } | null;
};

export default function InventoryLedgerPage() {
  const { activeBranchId } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/movements?limit=100`, {
        credentials: "include",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await res.json();
      if (data.success) {
        setMovements(data.movements);
      } else {
        setErrorMsg("Failed to load inventory movements.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error fetching movements.");
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  return (
    <div className="mt-1 flex flex-col gap-3 pb-6 animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <Link
          href="/products"
          aria-label="Back to products"
          title="Back"
          className={buttonVariants({ variant: "secondary", size: "icon" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title="Inventory Movement Ledger"
          subtitle="Double-entry log of all stock inbound, outbound, and inventory changes."
        />
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        {errorMsg && (
          <div className="shrink-0 border-b border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
            {errorMsg}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-52">Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Vendor / Source</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={6}>Loading ledger...</TableEmpty>
            ) : movements.length === 0 ? (
              <TableEmpty colSpan={6}>No movements found.</TableEmpty>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-caption text-gray-600">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="text-body font-semibold text-gray-900">
                      {m.product?.name || "Unknown"}
                    </p>
                    {m.product?.sku && (
                      <p className="font-mono text-caption text-gray-500">
                        {m.product.sku}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge
                        uppercase
                        variant={
                          m.direction === "IN"
                            ? "success"
                            : m.direction === "OUT"
                              ? "danger"
                              : "brand"
                        }
                        className="w-fit"
                      >
                        {m.direction} ({m.referenceType})
                      </Badge>
                      {m.notes && (
                        <span
                          className="max-w-52 truncate text-caption text-gray-500"
                          title={m.notes}
                        >
                          {m.notes}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex max-w-56 items-center gap-1.5 text-caption text-gray-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span
                        className="truncate"
                        title={
                          m.cabinet
                            ? `${m.cabinet.name} ${m.cabinet.location ? `(${m.cabinet.location})` : ""}`
                            : "Default"
                        }
                      >
                        {m.cabinet
                          ? `${m.cabinet.name} ${m.cabinet.location ? `(${m.cabinet.location})` : ""}`
                          : "Default"}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.vendor ? (
                      <div className="flex w-fit items-center gap-1.5 rounded border border-border bg-gray-50 px-2 py-0.5 text-caption font-medium text-gray-700">
                        <Truck className="h-3.5 w-3.5 text-gray-500" />
                        {m.vendor.businessName}
                      </div>
                    ) : (
                      <span className="text-caption text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`text-body font-semibold ${
                        m.direction === "IN"
                          ? "text-success"
                          : m.direction === "OUT"
                            ? "text-danger"
                            : "text-gray-700"
                      }`}
                    >
                      {m.direction === "IN"
                        ? "+"
                        : m.direction === "OUT"
                          ? "-"
                          : ""}
                      {m.quantity}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
