"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import EditCustomerModal from "@/components/modals/EditCustomerModal";
import AlertDialog from "@/components/ui/alert-dialog";
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
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        <div className="animate-pulse">Loading customer profile...</div>
      </div>
    );
  }

  if (pageError || !customer) {
    return (
      <div className="p-6 text-center max-w-md mx-auto mt-10">
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mb-4">
          {pageError || "Customer profile not found"}
        </div>
        <Link
          href="/customers"
          className="text-blue-600 font-semibold hover:underline"
        >
          &larr; Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10 mt-2">
      {/* 🟢 TOP ACTION BAR */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border shadow-sm transition-colors ${isDefaulter ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/customers"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                {customer.name}
              </h1>

              {/* Dynamic Badges */}
              {isDefaulter && (
                <span className="bg-rose-600 text-white text-xs font-black px-2.5 py-1 rounded-md flex items-center gap-1 shadow-sm uppercase tracking-wide">
                  <UserX className="w-3.5 h-3.5" /> Defaulter
                </span>
              )}
              {!isDefaulter && customer.metrics.outstandingBalance > 0 && (
                <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-md border border-rose-200">
                  Owes Rs.{" "}
                  {customer.metrics.outstandingBalance.toLocaleString()}
                </span>
              )}
              {!isDefaulter && customer.metrics.outstandingBalance === 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-200">
                  Account Settled
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Customer since {customer.joined}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={generatePDF}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Download Statement
          </button>
          <a
            href={`https://wa.me/${formatPakistaniPhone(customer.phone)}?text=${encodeURIComponent(
              `Assalam-o-Alaikum ${customer.name},\n\n*DeepKhata Account Statement*\n--------------------------------\n• Current Udhar Balance (Baqaya): Rs. ${(customer.metrics?.outstandingBalance || 0).toLocaleString()}\n• Credit Limit: Rs. ${(customer.creditLimit || 0).toLocaleString()}\n• Total Orders: ${customer.metrics?.totalOrders || 0}\n--------------------------------\nThank you for your business!\nDeepKhata / BizFlow`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-xl text-sm font-semibold hover:bg-[#20bd5a] transition-colors shadow-sm"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp Statement
          </a>
          <Link
            href={`/orders/new?customerId=${customer.id}`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Order
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ==========================================
            LEFT COLUMN: INFO & RISK MANAGEMENT
        ========================================== */}
        <div className="w-full lg:w-[350px] flex flex-col gap-6">
          {/* 🔴 CREDIT & RISK MANAGEMENT */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Risk & Credit Rules
              {!canManageRisk && <Lock className="w-3 h-3 text-slate-300" />}
            </h3>

            <div className="space-y-5">
              {/* Credit Limit Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Udhaar /
                  Credit Limit
                </label>
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                  <span className="px-3 text-slate-500 text-sm font-medium border-r border-slate-300">
                    Rs.
                  </span>
                  <input
                    type="number"
                    value={creditLimit}
                    disabled={!canManageRisk}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    onBlur={handleCreditLimitBlur}
                    onKeyDown={handleCreditLimitKeyDown}
                    className={`w-full py-2 px-3 text-sm outline-none font-bold ${canManageRisk ? "bg-transparent text-slate-900" : "bg-slate-100 text-slate-500 cursor-not-allowed"}`}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[10px] font-medium">
                  <span className="text-slate-500">
                    Currently used: Rs.{" "}
                    {customer.metrics.outstandingBalance.toLocaleString()}
                  </span>
                  <span
                    className={`${creditLimit - customer.metrics.outstandingBalance < 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    Available: Rs.{" "}
                    {(
                      creditLimit - customer.metrics.outstandingBalance
                    ).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Defaulter Toggle */}
              <div className="flex items-center justify-between p-3 border border-rose-100 bg-rose-50/50 rounded-lg">
                <div>
                  <p className="font-bold text-rose-900 text-sm">
                    Mark as Defaulter
                  </p>
                  <p className="text-[10px] text-rose-700/80 leading-tight mt-0.5">
                    Blocks staff from giving udhaar.
                  </p>
                </div>
                <div
                  onClick={canManageRisk ? handleToggleDefaulter : undefined}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${canManageRisk ? "cursor-pointer" : "cursor-not-allowed opacity-70"} ${isDefaulter ? "bg-rose-600" : "bg-slate-300"}`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isDefaulter ? "translate-x-5" : "translate-x-0"}`}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* CONTACT & KYC DETAILS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Contact & KYC
              </h3>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="text-xs font-semibold text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                Edit
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium">{customer.phone}</p>
                  <p className="text-xs text-slate-500">Mobile</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-slate-700">
                <QrCode className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <p className="font-mono font-medium text-slate-900">
                      {customer.cnic || "Not provided"}
                    </p>
                    <button className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 transition-colors">
                      <QrCode className="w-3 h-3" /> SCAN QR
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">CNIC Number</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-slate-700">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {customer.guarantorPhone || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Guarantor Phone (Zamanat)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-slate-700 pt-2 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium leading-relaxed">
                    {customer.address || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Shipping Address</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lifetime Metrics Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Financial Overview
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  Total Orders
                </span>
                <span className="text-base font-bold text-slate-900">
                  {customer.metrics.totalOrders}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  Lifetime Spend
                </span>
                <span className="text-base font-bold text-slate-900">
                  Rs. {customer.metrics.lifetimeValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
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
            <div className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* TABS HEADER */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("ledger")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      activeTab === "ledger"
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>Ledger Statement (Khata)</span>
                    <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                      {customer.ledger?.length || 0}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("orders")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      activeTab === "orders"
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span>Order History</span>
                    <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                      {customer.orderHistory?.length || 0}
                    </span>
                  </button>
                </div>
              </div>

              {activeTab === "ledger" ? (
                <div className="flex-1 flex flex-col">
                  {/* Financial Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/40">
                    <div className="p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Total Udhar (Debits)
                      </p>
                      <p className="text-lg font-bold text-rose-600 mt-0.5">
                        Rs. {totalLedgerDebit.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Total Wasool (Credits)
                      </p>
                      <p className="text-lg font-bold text-emerald-600 mt-0.5">
                        Rs. {totalLedgerCredit.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-rose-50/30">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Net Udhar Baqaya
                      </p>
                      <p className="text-xl font-black text-rose-700 mt-0.5">
                        Rs. {currentNetBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Ledger Postings Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="px-5 py-3 font-semibold">
                            Date & Time
                          </th>
                          <th className="px-5 py-3 font-semibold">Type</th>
                          <th className="px-5 py-3 font-semibold">
                            Description / Ref
                          </th>
                          <th className="px-5 py-3 font-semibold text-right">
                            Debit (+ Udhar)
                          </th>
                          <th className="px-5 py-3 font-semibold text-right">
                            Credit (- Payment)
                          </th>
                          <th className="px-5 py-3 font-semibold text-right">
                            Running Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {!customer.ledger || customer.ledger.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-5 py-12 text-center text-slate-500"
                            >
                              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                              <p className="font-semibold text-slate-700">
                                No Ledger Postings Yet
                              </p>
                              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                Double-entry postings will appear here when
                                orders are finalized or payments are recorded.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          customer.ledger.map((item: any) => (
                            <tr
                              key={item.id}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              <td className="px-5 py-3.5 text-xs text-slate-500 font-medium">
                                {item.formattedDate}
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex items-center gap-1 py-1 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-wide border ${
                                    item.type === "PAYMENT"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                  }`}
                                >
                                  {item.type === "PAYMENT" ? (
                                    <>
                                      <ArrowDownLeft className="w-3 h-3 text-emerald-600" />{" "}
                                      Payment
                                    </>
                                  ) : (
                                    <>
                                      <ArrowUpRight className="w-3 h-3 text-blue-600" />{" "}
                                      Sale
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="font-medium text-slate-800 text-xs sm:text-sm">
                                  {item.description}
                                </p>
                                {item.referenceId && (
                                  <Link
                                    href={`/orders/${item.referenceId}`}
                                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                                  >
                                    <span>
                                      Ref: ORD-{item.referenceId.slice(0, 8)}
                                    </span>
                                    <ArrowUpRight className="w-2.5 h-2.5" />
                                  </Link>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                {item.debit > 0 ? (
                                  <span className="font-bold text-rose-600">
                                    Rs. {item.debit.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                {item.credit > 0 ? (
                                  <span className="font-bold text-emerald-600">
                                    Rs. {item.credit.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <span className="font-black text-slate-900">
                                  Rs. {item.balance.toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Order ID</th>
                        <th className="px-5 py-3 font-semibold">Date</th>
                        <th className="px-5 py-3 font-semibold">
                          Total Amount
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          Payment Status
                        </th>
                        <th className="px-5 py-3 font-semibold">
                          Pending Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer.orderHistory &&
                      customer.orderHistory.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-8 text-center text-slate-500"
                          >
                            No order history found for this customer.
                          </td>
                        </tr>
                      ) : (
                        (customer.orderHistory || []).map((order: any) => (
                          <tr
                            key={order.id}
                            className={`transition-colors group ${
                              order.status === "CANCELLED"
                                ? "bg-slate-50 opacity-60"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="px-5 py-4">
                              <Link
                                href={`/orders/${order.id}`}
                                className={`font-semibold hover:underline ${
                                  order.status === "CANCELLED"
                                    ? "text-slate-400 line-through"
                                    : "text-blue-600"
                                }`}
                              >
                                {order.orderNumber}
                              </Link>
                            </td>
                            <td className="px-5 py-4 text-slate-600">
                              <span
                                className={
                                  order.status === "CANCELLED"
                                    ? "line-through"
                                    : ""
                                }
                              >
                                {order.date}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-medium">
                              <span
                                className={
                                  order.status === "CANCELLED"
                                    ? "line-through text-slate-400"
                                    : ""
                                }
                              >
                                Rs. {order.total.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {order.status === "CANCELLED" ? (
                                <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-500 border border-slate-300">
                                  <XCircle className="w-3 h-3" /> CANCELLED
                                </span>
                              ) : (
                                <>
                                  {order.payment === "PAID" && (
                                    <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700">
                                      <CheckCircle2 className="w-3 h-3" /> PAID
                                    </span>
                                  )}
                                  {order.payment === "PARTIAL" && (
                                    <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-yellow-50 text-yellow-700">
                                      <Clock className="w-3 h-3" /> PARTIAL
                                    </span>
                                  )}
                                  {order.payment === "UNPAID" && (
                                    <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      <AlertCircle className="w-3 h-3" /> UNPAID
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {order.status === "CANCELLED" ? (
                                <span className="text-slate-400 font-medium italic">
                                  -
                                </span>
                              ) : order.balance > 0 ? (
                                <span className="font-bold text-rose-600">
                                  Rs. {order.balance.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">
                                  Settled
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
