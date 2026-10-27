"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import EditCustomerModal from "@/components/modals/EditCustomerModal";
import AlertDialog from "@/components/ui/alert-dialog";
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
import { usePermissions } from "@/hooks/usePermissions";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Mail,
  Plus,
  MessageCircle,
  ShoppingBag,
  Wallet,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  QrCode,
  ShieldAlert,
  CreditCard,
  UserX,
  XCircle,
  Lock,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  FileSpreadsheet,
} from "lucide-react";
import { formatPakistaniPhone } from "@/lib/utils";

import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export default function CustomerProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const { hasPermission } = usePermissions();
  const canManageRisk = hasPermission("manage:risk");

  const [customer, setCustomer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"ledger" | "orders">("ledger");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Interactive States
  const [isDefaulter, setIsDefaulter] = useState(false);
  const [creditLimit, setCreditLimit] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [messageAlert, setMessageAlert] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const fetchCustomerData = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/customer/${id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to load customer profile");
      }

      // 🟢 FORMAT THE ORDER HISTORY PROPERLY
      const formattedOrderHistory = (data.customer.orderHistory || []).map(
        (order: any) => ({
          ...order,
          orderNumber: `ORD-${order.orderNumber || order.id.substring(0, 4)}`,
          date: new Date(order.date || order.createdAt).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          ),
        }),
      );

      // 🟢 FORMAT THE DOUBLE-ENTRY LEDGER POSTINGS
      const formattedLedger = (data.customer.ledger || []).map((item: any) => ({
        ...item,
        formattedDate: new Date(item.date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      // Update the customer object with the formatted history and ledger
      const formattedCustomer = {
        ...data.customer,
        orderHistory: formattedOrderHistory,
        ledger: formattedLedger,
      };

      setCustomer(formattedCustomer);
      setCreditLimit(data.customer.creditLimit);
      setIsDefaulter(data.customer.isDefaulter);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load customer profile",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void fetchCustomerData();
    }
  }, [id, fetchCustomerData]);

  const updateRiskSettings = async (
    newCreditLimit: number,
    newIsDefaulter: boolean,
  ) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/customer/customerrisk/${id}`,
        {
          credentials: "include",
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            creditLimit: newCreditLimit,
            isDefaulter: newIsDefaulter,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to update risk settings",
        );
      }

      setCreditLimit(data.customer.creditLimit);
      setIsDefaulter(data.customer.isDefaulter);

      // Keep customer object in sync
      setCustomer((prev: any) => ({
        ...prev,
        creditLimit: data.customer.creditLimit,
        isDefaulter: data.customer.isDefaulter,
      }));
    } catch (error) {
      setMessageAlert({
        title: "Failed to Update Risk Settings",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update risk settings",
      });
      if (customer) {
        setCreditLimit(customer.creditLimit);
        setIsDefaulter(customer.isDefaulter);
      }
    }
  };

  const handleToggleDefaulter = () => {
    const nextVal = !isDefaulter;
    setIsDefaulter(nextVal);
    void updateRiskSettings(creditLimit, nextVal);
  };

  const handleCreditLimitBlur = () => {
    void updateRiskSettings(creditLimit, isDefaulter);
  };

  const handleCreditLimitKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handleSaveDetails = async (updatedData: any) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/customer/customerdetails/${id}`,
        {
          credentials: "include",
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: updatedData.name,
            phone: updatedData.phone,
            email: updatedData.email,
            address: updatedData.address,
            cnicNumber: updatedData.cnic,
            guarantorPhone: updatedData.guarantorPhone,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to update customer details",
        );
      }

      setCustomer((prev: any) => ({
        ...prev,
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email || "",
        address: data.customer.address || "",
        cnic: data.customer.cnicNumber || "",
        guarantorPhone: data.customer.guarantorPhone || "",
      }));
    } catch (error) {
      setMessageAlert({
        title: "Failed to Update Customer Details",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update customer details",
      });
    }
  };

  const generatePDF = () => {
    if (!customer) return;

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text("Customer Ledger Statement", 14, 22);

    doc.setFontSize(12);
    doc.text(`Customer: ${customer.name}`, 14, 32);
    doc.text(`Phone: ${customer.phone}`, 14, 38);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);

    // Ledger Data
    const tableColumn = [
      "Date",
      "Type",
      "Description",
      "Debit (Udhar)",
      "Credit (Wasool)",
      "Balance",
    ];
    const tableRows: any[] = [];

    if (customer.ledger && customer.ledger.length > 0) {
      customer.ledger.forEach((item: any) => {
        const date = item.formattedDate;
        const type = item.type;
        const desc = item.description;
        const debit =
          item.debit > 0 ? `Rs. ${item.debit.toLocaleString()}` : "-";
        const credit =
          item.credit > 0 ? `Rs. ${item.credit.toLocaleString()}` : "-";
        const balance = `Rs. ${item.balance.toLocaleString()}`;
        tableRows.push([date, type, desc, debit, credit, balance]);
      });
    }

    autoTable(doc, {
      startY: 50,
      head: [tableColumn],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [51, 122, 183] }, // Blueish color
    });

    const finalBalance =
      customer.ledger && customer.ledger.length > 0
        ? customer.ledger[customer.ledger.length - 1].balance
        : customer.metrics?.outstandingBalance || 0;

    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.text(
      `Final Outstanding Balance: Rs. ${finalBalance.toLocaleString()}`,
      14,
      finalY + 10,
    );

    doc.save(
      `Statement_${customer.name}_${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-body text-gray-500">
        <div className="animate-pulse">Loading customer profile...</div>
      </div>
    );
  }

  if (pageError || !customer) {
    return (
      <div className="mx-auto mt-10 max-w-md p-6 text-center">
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-bg p-4 text-body text-danger-fg">
          {pageError || "Customer profile not found"}
        </div>
        <Link
          href="/customers"
          className="text-body font-semibold text-brand-700 hover:underline"
        >
          &larr; Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-3 pb-10 animate-in fade-in duration-300">
      {/* TOP ACTION BAR */}
      <Card
        className={`px-4 py-3 ${isDefaulter ? "border-danger/30 bg-danger-bg" : ""}`}
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Link
              href="/customers"
              title="Back to customers"
              className={buttonVariants({ variant: "secondary", size: "icon" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-title font-semibold text-gray-900">
                  {customer.name}
                </h1>

                {/* Dynamic Badges */}
                {isDefaulter && (
                  <Badge variant="danger" uppercase>
                    <UserX className="w-3 h-3" /> Defaulter
                  </Badge>
                )}
                {!isDefaulter && customer.metrics.outstandingBalance > 0 && (
                  <Badge variant="danger">
                    Owes Rs.{" "}
                    {customer.metrics.outstandingBalance.toLocaleString()}
                  </Badge>
                )}
                {!isDefaulter && customer.metrics.outstandingBalance === 0 && (
                  <Badge variant="success" uppercase>Account Settled</Badge>
                )}
              </div>
              <p className="mt-0.5 text-caption text-gray-500">
                Customer since {customer.joined}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={generatePDF}>
              <FileSpreadsheet className="w-4 h-4" /> Download Statement
            </Button>
            <a
              href={`https://wa.me/${formatPakistaniPhone(customer.phone)}?text=${encodeURIComponent(
                `Assalam-o-Alaikum ${customer.name},\n\n*DeepKhata Account Statement*\n--------------------------------\n• Current Udhar Balance (Baqaya): Rs. ${(customer.metrics?.outstandingBalance || 0).toLocaleString()}\n• Credit Limit: Rs. ${(customer.creditLimit || 0).toLocaleString()}\n• Total Orders: ${customer.metrics?.totalOrders || 0}\n--------------------------------\nThank you for your business!\nDeepKhata`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp Statement
            </a>
            <Link
              href={`/orders/new?customerId=${customer.id}`}
              className={buttonVariants({ variant: "primary" })}
            >
              <Plus className="w-4 h-4" /> New Order
            </Link>
          </div>
        </div>
      </Card>

      <div className="flex flex-col items-start gap-3 lg:flex-row">
        {/* ==========================================
            LEFT COLUMN: INFO & RISK MANAGEMENT
        ========================================== */}
        <div className="flex w-full flex-col gap-3 lg:w-[336px]">
          {/* CREDIT & RISK MANAGEMENT */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-gray-500">
                <ShieldAlert className="w-4 h-4" /> Risk & Credit Rules
                {!canManageRisk && <Lock className="w-3 h-3 text-gray-400" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-3">
              {/* Credit Limit Input */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-caption font-medium text-gray-700">
                  <CreditCard className="w-3.5 h-3.5 text-gray-400" /> Udhaar /
                  Credit Limit
                </label>
                <div className="flex items-center overflow-hidden rounded-md border border-border bg-gray-50 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                  <span className="shrink-0 border-r border-border px-2.5 text-body font-medium text-gray-500">
                    Rs.
                  </span>
                  <input
                    type="number"
                    value={creditLimit}
                    disabled={!canManageRisk}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    onBlur={handleCreditLimitBlur}
                    onKeyDown={handleCreditLimitKeyDown}
                    className={`h-9 w-full px-2.5 text-body font-semibold outline-none ${canManageRisk ? "bg-transparent text-gray-900" : "cursor-not-allowed bg-gray-100 text-gray-500"}`}
                  />
                </div>
                <div className="mt-1 flex justify-between text-caption font-medium">
                  <span className="text-gray-500">
                    Currently used: Rs.{" "}
                    {customer.metrics.outstandingBalance.toLocaleString()}
                  </span>
                  <span
                    className={`${creditLimit - customer.metrics.outstandingBalance < 0 ? "text-danger" : "text-success"}`}
                  >
                    Available: Rs.{" "}
                    {(
                      creditLimit - customer.metrics.outstandingBalance
                    ).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Defaulter Toggle */}
              <div
                className={`flex items-center justify-between rounded-md border p-2.5 ${isDefaulter ? "border-danger/30 bg-danger-bg" : "border-border bg-gray-50"}`}
              >
                <div>
                  <p
                    className={`text-body font-semibold ${isDefaulter ? "text-danger-fg" : "text-gray-700"}`}
                  >
                    Mark as Defaulter
                  </p>
                  <p
                    className={`mt-0.5 text-caption leading-tight ${isDefaulter ? "text-danger-fg/80" : "text-gray-500"}`}
                  >
                    Blocks staff from giving udhaar.
                  </p>
                </div>
                <div
                  onClick={canManageRisk ? handleToggleDefaulter : undefined}
                  className={`h-6 w-11 rounded-full p-1 transition-colors ${canManageRisk ? "cursor-pointer" : "cursor-not-allowed opacity-70"} ${isDefaulter ? "bg-danger" : "bg-gray-300"}`}
                >
                  <div
                    className={`h-4 w-4 rounded-full bg-card shadow-xs transition-transform ${isDefaulter ? "translate-x-5" : "translate-x-0"}`}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CONTACT & KYC DETAILS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-2.5">
              <CardTitle className="text-caption font-semibold uppercase tracking-wide text-gray-500">
                Contact & KYC
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
              >
                Edit
              </Button>
            </CardHeader>

            <CardContent className="space-y-3 px-4 py-3 text-body">
              <div className="flex items-start gap-2.5 text-gray-700">
                <Phone className="mt-0.5 w-4 h-4 shrink-0 text-gray-400" />
                <div>
                  <p className="font-medium">{customer.phone}</p>
                  <p className="text-caption text-gray-500">Mobile</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-gray-700">
                <QrCode className="mt-0.5 w-4 h-4 shrink-0 text-gray-400" />
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono font-medium text-gray-900">
                      {customer.cnic || "Not provided"}
                    </p>
                    <Badge variant="brand">
                      <QrCode className="w-3 h-3" /> Scan QR
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-caption text-gray-500">CNIC Number</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-gray-700">
                <User className="mt-0.5 w-4 h-4 shrink-0 text-gray-400" />
                <div>
                  <p className="font-medium">
                    {customer.guarantorPhone || "Not provided"}
                  </p>
                  <p className="text-caption text-gray-500">
                    Guarantor Phone (Zamanat)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-border pt-3 text-gray-700">
                <MapPin className="mt-0.5 w-4 h-4 shrink-0 text-gray-400" />
                <div>
                  <p className="font-medium leading-relaxed">
                    {customer.address || "Not provided"}
                  </p>
                  <p className="text-caption text-gray-500">Shipping Address</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lifetime Metrics Card */}
          <Card>
            <CardHeader className="px-4 py-2.5">
              <CardTitle className="text-caption font-semibold uppercase tracking-wide text-gray-500">
                Financial Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between rounded-md border border-border bg-gray-50 p-2.5">
                <span className="text-caption font-medium text-gray-500">
                  Total Orders
                </span>
                <span className="text-subtitle font-semibold text-gray-900">
                  {customer.metrics.totalOrders}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-gray-50 p-2.5">
                <span className="text-caption font-medium text-gray-500">
                  Lifetime Spend
                </span>
                <span className="text-subtitle font-semibold text-gray-900">
                  Rs. {customer.metrics.lifetimeValue.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==========================================
            RIGHT COLUMN: TABBED LEDGER & ORDERS
        ========================================== */}
        {(() => {
          const totalLedgerDebit = (customer.ledger || []).reduce(
            (sum: number, item: any) => sum + Number(item.debit || 0),
            0,
          );
          const totalLedgerCredit = (customer.ledger || []).reduce(
            (sum: number, item: any) => sum + Number(item.credit || 0),
            0,
          );
          const currentNetBalance =
            customer.ledger && customer.ledger.length > 0
              ? customer.ledger[customer.ledger.length - 1].balance
              : customer.metrics?.outstandingBalance || 0;

          return (
            <Card className="flex w-full flex-1 flex-col overflow-hidden">
              {/* TABS HEADER */}
              <div className="flex items-center justify-between gap-3 border-b border-border bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={activeTab === "ledger" ? "secondary" : "ghost"}
                    onClick={() => setActiveTab("ledger")}
                  >
                    <BookOpen className="w-4 h-4 text-brand-700" />
                    <span>Ledger Statement (Khata)</span>
                    <Badge variant="brand">
                      {customer.ledger?.length || 0}
                    </Badge>
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTab === "orders" ? "secondary" : "ghost"}
                    onClick={() => setActiveTab("orders")}
                  >
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span>Order History</span>
                    <Badge variant="neutral">
                      {customer.orderHistory?.length || 0}
                    </Badge>
                  </Button>
                </div>
              </div>

              {activeTab === "ledger" ? (
                <div className="flex flex-1 flex-col">
                  {/* Financial Summary Cards */}
                  <div className="grid grid-cols-1 divide-y divide-border border-b border-border bg-gray-50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="px-4 py-2.5">
                      <p className="text-caption font-semibold uppercase tracking-wide text-gray-500">
                        Total Udhar (Debits)
                      </p>
                      <p className="mt-0.5 text-subtitle font-semibold text-danger">
                        Rs. {totalLedgerDebit.toLocaleString()}
                      </p>
                    </div>
                    <div className="px-4 py-2.5">
                      <p className="text-caption font-semibold uppercase tracking-wide text-gray-500">
                        Total Wasool (Credits)
                      </p>
                      <p
                        className={`mt-0.5 text-subtitle font-semibold ${totalLedgerCredit > 0 ? "text-success" : "text-gray-900"}`}
                      >
                        Rs. {totalLedgerCredit.toLocaleString()}
                      </p>
                    </div>
                    <div className="px-4 py-2.5">
                      <p className="text-caption font-semibold uppercase tracking-wide text-gray-700">
                        Net Udhar Baqaya
                      </p>
                      <p
                        className={`mt-0.5 text-subtitle font-semibold ${currentNetBalance > 0 ? "text-danger" : currentNetBalance < 0 ? "text-success" : "text-gray-900"}`}
                      >
                        Rs. {currentNetBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Ledger Postings Table */}
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-32 whitespace-nowrap">
                          Date
                        </TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead>Description / Ref</TableHead>
                        <TableHead
                          className="whitespace-nowrap text-right"
                          title="Debit (+ Udhar)"
                        >
                          Debit
                        </TableHead>
                        <TableHead
                          className="whitespace-nowrap text-right"
                          title="Credit (Wasool)"
                        >
                          Credit
                        </TableHead>
                        <TableHead
                          className="whitespace-nowrap text-right"
                          title="Running Balance"
                        >
                          Balance
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!customer.ledger || customer.ledger.length === 0 ? (
                        <TableEmpty colSpan={6}>
                          <EmptyState
                            className="border-0 bg-transparent py-6 shadow-none"
                            icon={BookOpen}
                            title="No ledger postings yet"
                            description="Double-entry postings will appear here when orders are finalized or payments are recorded."
                          />
                        </TableEmpty>
                      ) : (
                        customer.ledger.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="whitespace-nowrap text-caption">
                              <span className="font-medium text-gray-700">
                                {item.formattedDate?.split(",").slice(0, 2).join(",")}
                              </span>
                              <span className="block text-gray-400">
                                {item.formattedDate
                                  ?.split(",")
                                  .slice(2)
                                  .join(",")
                                  .trim()}
                              </span>
                            </TableCell>
                            <TableCell>
                              {item.type === "PAYMENT" ? (
                                <Badge variant="success" uppercase>
                                  <ArrowDownLeft className="w-3 h-3" /> Payment
                                </Badge>
                              ) : (
                                <Badge variant="brand" uppercase>
                                  <ArrowUpRight className="w-3 h-3" /> Sale
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <p
                                title={item.description}
                                className="max-w-36 truncate font-medium text-gray-800"
                              >
                                {item.description}
                              </p>
                              {item.referenceId && (
                                <Link
                                  href={`/orders/${item.referenceId}`}
                                  className="mt-0.5 flex items-center gap-0.5 text-caption text-brand-700 hover:underline"
                                >
                                  <span>
                                    Ref: ORD-{item.referenceId.slice(0, 8)}
                                  </span>
                                  <ArrowUpRight className="w-2.5 h-2.5" />
                                </Link>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.debit > 0 ? (
                                <span className="font-semibold text-danger">
                                  Rs. {item.debit.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.credit > 0 ? (
                                <span className="font-semibold text-success">
                                  Rs. {item.credit.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-gray-900">
                              Rs. {item.balance.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Order ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead className="w-40">Payment Status</TableHead>
                      <TableHead>Pending Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.orderHistory &&
                    customer.orderHistory.length === 0 ? (
                      <TableEmpty colSpan={5}>
                        No order history found for this customer.
                      </TableEmpty>
                    ) : (
                      (customer.orderHistory || []).map((order: any) => (
                        <TableRow
                          key={order.id}
                          className={
                            order.status === "CANCELLED" ? "opacity-60" : ""
                          }
                        >
                          <TableCell>
                            <Link
                              href={`/orders/${order.id}`}
                              className={`font-semibold hover:underline ${
                                order.status === "CANCELLED"
                                  ? "text-gray-400 line-through"
                                  : "text-brand-700"
                              }`}
                            >
                              {order.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="text-gray-600">
                            <span
                              className={
                                order.status === "CANCELLED"
                                  ? "line-through"
                                  : ""
                              }
                            >
                              {order.date}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            <span
                              className={
                                order.status === "CANCELLED"
                                  ? "text-gray-400 line-through"
                                  : ""
                              }
                            >
                              Rs. {order.total.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            {order.status === "CANCELLED" ? (
                              <Badge variant="neutral" uppercase>
                                <XCircle className="w-3 h-3" /> Cancelled
                              </Badge>
                            ) : order.payment === "PAID" ? (
                              <Badge variant="success" uppercase>
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </Badge>
                            ) : order.payment === "PARTIAL" ? (
                              <Badge variant="warning" uppercase>
                                <Clock className="w-3 h-3" /> Partial
                              </Badge>
                            ) : (
                              <Badge variant="danger" uppercase>
                                <AlertCircle className="w-3 h-3" /> Unpaid
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.status === "CANCELLED" ? (
                              <span className="font-medium italic text-gray-400">
                                -
                              </span>
                            ) : order.balance > 0 ? (
                              <span className="font-semibold text-danger">
                                Rs. {order.balance.toLocaleString()}
                              </span>
                            ) : (
                              <span className="font-medium text-gray-400">
                                Settled
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </Card>
          );
        })()}
      </div>

      {/* 🟢 MODAL COMPONENT */}
      <EditCustomerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        customer={customer}
        onSave={handleSaveDetails}
      />

      {/* Message Dialog (replaces native alert) */}
      <AlertDialog
        isOpen={messageAlert !== null}
        title={messageAlert?.title || ""}
        description={messageAlert?.description || ""}
        icon={<AlertCircle className="w-6 h-6" />}
        onClose={() => setMessageAlert(null)}
      />
    </div>
  );
}
