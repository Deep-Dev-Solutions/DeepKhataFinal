"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Phone,
  ArrowRight,
  Wallet,
  CheckCircle2,
  Search,
  Package,
  Layers,
  ShoppingBag,
  MapPin,
  Clock,
  Loader2,
  X,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import AddVendorModal from "@/components/modals/AddVendorModal";
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

type VendorRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  address?: string | null;
  balance: number;
  totalPurchased?: number;
  totalPaid?: number;
  totalUnitsSupplied?: number;
  productsCount?: number;
  inStockUnits?: number;
  lastActivityDate?: string | null;
};

function VendorsPageContent() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "payable" | "settled">(
    "all",
  );

  const refreshVendors = useCallback(async () => {
    setIsLoading(true);
    setPageError("");

    try {
      const response = await fetch(`${API_BASE_URL}/vendors`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to load vendors",
        );
      }

      setVendors(data?.vendors || []);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load vendors",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshVendors();
  }, [refreshVendors]);

  const totalPayable = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.balance > 0 ? v.balance : 0), 0),
    [vendors],
  );

  const totalPurchases = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.totalPurchased || 0), 0),
    [vendors],
  );

  const totalPaid = useMemo(
    () => vendors.reduce((sum, v) => sum + (v.totalPaid || 0), 0),
    [vendors],
  );

  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      if (filterMode === "payable" && v.balance <= 0) return false;
      if (filterMode === "settled" && v.balance > 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        v.businessName.toLowerCase().includes(q) ||
        (v.contactName && v.contactName.toLowerCase().includes(q)) ||
        (v.phone && v.phone.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
      );
    });
  }, [vendors, filterMode, searchQuery]);

  return (
    <div data-testid="vendors-page" className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Vendor Hub"
        subtitle="Manage your suppliers, track accounts payable, and trace inventory purchased."
        actions={
          <Button
            data-testid="vendors-new"
            onClick={() => setIsAddModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> New Vendor
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Accounts Payable
              </p>
              <p className="text-title font-semibold text-danger">
                Rs. {isLoading ? "..." : totalPayable.toLocaleString()}
              </p>
              <p className="text-caption text-gray-400">
                Owed to vendors
              </p>
            </div>
            <div className="rounded-md bg-danger-bg p-1.5 text-danger">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Lifetime Sourced
              </p>
              <p className="text-title font-semibold text-gray-900">
                Rs. {isLoading ? "..." : totalPurchases.toLocaleString()}
              </p>
              <p className="text-caption text-gray-400">Goods purchased</p>
            </div>
            <div className="rounded-md bg-brand-50 p-1.5 text-brand-700">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Total Paid Out
              </p>
              <p className="text-title font-semibold text-success">
                Rs. {isLoading ? "..." : totalPaid.toLocaleString()}
              </p>
              <p className="text-caption text-gray-400">Settled payments</p>
            </div>
            <div className="rounded-md bg-success-bg p-1.5 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Active Vendors
              </p>
              <p className="text-title font-semibold text-gray-900">
                {isLoading ? "..." : vendors.length}
              </p>
              <p className="text-caption text-gray-400">Registered suppliers</p>
            </div>
            <div className="rounded-md bg-gray-100 p-1.5 text-gray-500">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Container */}
      <Card className="flex-1 overflow-hidden">
        {pageError && (
          <div className="flex items-center justify-between border-b border-border bg-danger-bg px-4 py-2 text-body text-danger-fg">
            <span>{pageError}</span>
            <button
              onClick={() => setPageError("")}
              aria-label="Dismiss error"
              className="rounded p-0.5 text-danger transition-colors hover:bg-danger/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col items-stretch justify-between gap-3 border-b border-border bg-gray-50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor name, contact person, phone..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <Button
              size="sm"
              variant={filterMode === "all" ? "primary" : "secondary"}
              onClick={() => setFilterMode("all")}
            >
              All ({vendors.length})
            </Button>
            <Button
              size="sm"
              variant={filterMode === "payable" ? "primary" : "secondary"}
              onClick={() => setFilterMode("payable")}
            >
              With Payable ({vendors.filter((v) => v.balance > 0).length})
            </Button>
            <Button
              size="sm"
              variant={filterMode === "settled" ? "primary" : "secondary"}
              onClick={() => setFilterMode("settled")}
            >
              Settled ({vendors.filter((v) => v.balance <= 0).length})
            </Button>
          </div>
        </div>

        {/* Vendors Table */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Vendor & Contact</TableHead>
              <TableHead>Items Supplied</TableHead>
              <TableHead className="text-right">Lifetime Sourced</TableHead>
              <TableHead className="text-right">Paid Out</TableHead>
              <TableHead className="text-right">Account Balance</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead className="w-16 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={7}>
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading vendors
                </span>
              </TableEmpty>
            ) : filteredVendors.length === 0 ? (
              <TableEmpty colSpan={7}>
                <EmptyState
                  className="border-0 bg-transparent py-6 shadow-none"
                  icon={Building2}
                  title="No vendors match your search"
                  description="Try clearing filters or add a new vendor."
                />
              </TableEmpty>
            ) : (
              filteredVendors.map((vendor) => (
                <TableRow
                  data-testid="vendor-row"
                  key={vendor.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/vendors/${vendor.id}`)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-body font-semibold text-gray-900 transition-colors group-hover:text-brand-700">
                        {vendor.businessName}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2">
                        {vendor.contactName && (
                          <span className="text-caption font-medium text-gray-600">
                            {vendor.contactName}
                          </span>
                        )}
                        {vendor.phone && (
                          <span className="flex items-center gap-1 font-mono text-caption text-gray-400">
                            <Phone className="h-3 w-3" />
                            {vendor.phone}
                          </span>
                        )}
                      </div>
                      {vendor.address && (
                        <span
                          title={vendor.address}
                          className="mt-0.5 flex max-w-64 items-center gap-1 truncate text-caption text-gray-400"
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{vendor.address}</span>
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-caption font-semibold text-gray-800">
                        {vendor.totalUnitsSupplied || 0} units
                      </span>
                      <span className="text-caption text-gray-400">
                        {vendor.productsCount || 0} products
                      </span>
                      {vendor.inStockUnits !== undefined &&
                        vendor.inStockUnits > 0 && (
                          <span className="text-caption font-semibold text-success">
                            {vendor.inStockUnits} in stock
                          </span>
                        )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right font-medium text-gray-700">
                    Rs. {(vendor.totalPurchased || 0).toLocaleString()}
                  </TableCell>

                  <TableCell className="text-right font-medium text-success">
                    Rs. {(vendor.totalPaid || 0).toLocaleString()}
                  </TableCell>

                  <TableCell
                    data-testid="vendor-row-balance"
                    className="text-right"
                  >
                    {vendor.balance > 0 ? (
                      <Badge variant="danger">
                        Owe Rs. {vendor.balance.toLocaleString()}
                      </Badge>
                    ) : (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" /> Settled
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-caption text-gray-500">
                    {vendor.lastActivityDate ? (
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="h-3 w-3 shrink-0 text-gray-400" />
                        {new Date(vendor.lastActivityDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/vendors/${vendor.id}`);
                      }}
                      className="inline-block rounded p-1.5 text-gray-400 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700"
                      title="View Vendor Details"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AddVendorModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={refreshVendors}
      />
    </div>
  );
}

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-body text-gray-500">
          Loading vendors...
        </div>
      }
    >
      <VendorsPageContent />
    </Suspense>
  );
}
