"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Users,
  Phone,
  ArrowRight,
  Filter,
  MessageCircle,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { offlineDb } from "@/lib/db";
import NewCustomerModal from "@/components/modals/NewCustomerModal";
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

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  shopName?: string | null;
  totalOrders: number;
  lifetimeValue: number;
  balance: number;
};

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

function CustomersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(
    searchParams.get("unpaid") === "true",
  );
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [pageError, setPageError] = useState("");

  // Quick Add State
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);

  // Debounce search query to prevent spamming the rate-limited endpoint
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Synchronize search query and filter with URL params
  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
    if (showUnpaidOnly) params.set("unpaid", "true");

    const currentQuery = searchParams.toString();
    const newQuery = params.toString();

    if (currentQuery !== newQuery) {
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [debouncedSearchQuery, showUnpaidOnly, pathname, searchParams]);

  // Fetch customers from backend
  const refreshCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    setPageError("");

    try {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      if (showUnpaidOnly) params.set("unpaid", "true");

      const response = await fetch(
        `${API_BASE_URL}/customer/getallcustomers?${params.toString()}`,
        {
          credentials: "include",
          headers: getAuthHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to load customers",
        );
      }

      const customerList = data?.customers || [];
      setCustomers(customerList);
      if (Array.isArray(customerList) && customerList.length > 0) {
        void offlineDb.customers.bulkPut(customerList);
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load customers",
      );
      setCustomers([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [debouncedSearchQuery, showUnpaidOnly]);

  // Fetch customers on load and when dependencies change
  useEffect(() => {
    void refreshCustomers();
  }, [refreshCustomers]);

  // --- MATH & FILTERS ---
  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.balance, 0);
  const unpaidCustomersCount = customers.filter((c) => c.balance > 0).length;
  const settledCustomersCount = customers.length - unpaidCustomersCount;

  return (
    <div data-testid="customers-page" className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300">
      {/* 1. PAGE HEADER */}
      <PageHeader
        title="Customers & Ledger"
        subtitle="Manage your clients, track outstanding balances, and send reminders."
        actions={
          <Button
            type="button"
            data-testid="customers-new"
            onClick={() => setIsNewCustomerModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> New Customer
          </Button>
        }
      />

      {/* 2. CRM METRICS CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Total Customers
              </p>
              <p className="text-title font-semibold text-gray-900">
                {isLoadingCustomers ? "..." : customers.length}
              </p>
            </div>
            <div className="rounded-md bg-brand-50 p-1.5 text-brand-700">
              <Users className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        {/* The most important metric for the owner */}
        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Total Outstanding Debt
              </p>
              <p className="text-title font-semibold text-danger">
                Rs.{" "}
                {isLoadingCustomers
                  ? "..."
                  : totalOutstandingDebt.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md bg-danger-bg p-1.5 text-danger">
              <Wallet className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-gray-500">
                Accounts Settled
              </p>
              <p className="text-title font-semibold text-gray-900">
                {isLoadingCustomers ? "..." : settledCustomersCount} clients
              </p>
            </div>
            <div className="rounded-md bg-success-bg p-1.5 text-success-fg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. SEARCH & FILTERS BAR */}
      <Card>
        <CardContent className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <Input data-testid="customers-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers by name or phone..."
              className="pl-9"
            />
          </div>

          {/* Active Toggle Button */}
          <Button
            variant={showUnpaidOnly ? "primary" : "secondary"}
            onClick={() => setShowUnpaidOnly(!showUnpaidOnly)}
            className="w-full sm:w-auto"
          >
            <Filter className="w-4 h-4" />
            {showUnpaidOnly ? "Showing Unpaid" : "Unpaid Only"}
          </Button>
        </CardContent>
      </Card>

      {/* 4. INLINE CRM TABLE */}
      <Card className="flex-1 overflow-hidden">
        {pageError && (
          <div className="flex items-center justify-between border-b border-border bg-danger-bg px-4 py-2 text-body text-danger-fg">
            <span>{pageError}</span>
            <button
              onClick={() => setPageError("")}
              className="rounded px-1 text-danger hover:bg-danger-bg"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Customer Details</TableHead>
              <TableHead className="w-24">Orders</TableHead>
              <TableHead className="w-40">Lifetime Spend</TableHead>
              <TableHead className="w-52">Outstanding Balance</TableHead>
              <TableHead className="w-36 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingCustomers ? (
              <TableEmpty colSpan={5}>
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <AlertCircle className="h-4 w-4 animate-pulse" /> Loading
                  customers from server...
                </span>
              </TableEmpty>
            ) : customers.length === 0 ? (
              <TableEmpty colSpan={5}>
                <EmptyState
                  className="border-0 bg-transparent py-6 shadow-none"
                  icon={Users}
                  title="No customers found"
                  description={
                    searchQuery || showUnpaidOnly
                      ? "No customers match the current search and filter."
                      : "Add your first customer to start a khata."
                  }
                />
              </TableEmpty>
            ) : (
              customers.map((customer) => {
                // Generate WhatsApp message for reminders
                const waMessage = encodeURIComponent(
                  `Hello ${customer.name}, this is a gentle reminder that an amount of Rs. ${customer.balance.toLocaleString()} is currently pending. Please settle at your earliest convenience.`,
                );

                return (
                  <TableRow data-testid="customer-row"
                    key={customer.id}
                    className="group cursor-pointer"
                    onClick={() => router.push(`/customers/${customer.id}`)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 transition-colors group-hover:text-brand-700">
                          {customer.name}
                        </span>
                        {customer.shopName && (
                          <span className="text-caption font-medium text-gray-500">
                            {customer.shopName}
                          </span>
                        )}
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 flex items-center gap-1 font-mono text-caption text-gray-500 hover:text-brand-700"
                        >
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer.totalOrders}
                    </TableCell>
                    <TableCell className="font-medium text-gray-700">
                      Rs. {customer.lifetimeValue.toLocaleString()}
                    </TableCell>
                    <TableCell data-testid="customer-row-balance">
                      {customer.balance > 0 ? (
                        <Badge variant="danger">
                          Owes Rs. {customer.balance.toLocaleString()}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Settled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* WhatsApp Reminder Button (Only shows if they owe money) */}
                        {customer.balance > 0 && (
                          <a
                            href={`https://wa.me/92${customer.phone.replace(/[^0-9]/g, "").substring(1)}?text=${waMessage}`}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-border bg-card px-2 text-caption font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                            title="Send WhatsApp Reminder"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Remind</span>
                          </a>
                        )}

                        <button className="rounded p-1.5 text-gray-400 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 🟢 Interrupt Modal — create customer without leaving the page */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onCreated={async () => {
          await refreshCustomers();
        }}
      />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-gray-500">
          Loading customers...
        </div>
      }
    >
      <CustomersPageContent />
    </Suspense>
  );
}
