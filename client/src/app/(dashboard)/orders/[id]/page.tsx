"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Receipt,
  Wallet,
  MessageCircle,
  History,
  FileText,
  Printer,
  ChevronDown,
  CheckCircle2,
  RefreshCcw,
  Banknote,
  CreditCard,
  User,
  AlertCircle,
  XCircle,
  Clock,
  RotateCcw,
  ShoppingBag,
  ArrowRightLeft,
  Share2,
  Sparkles,
  Check,
} from "lucide-react";
import { generateWhatsAppReceipt } from "@/lib/utils";

// You will need to create this modal component next!
import RecordPaymentModal from "@/components/modals/RecordPaymentModal";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export default function OrderDetailsLedger() {
  const { id } = useParams(); // The secret UUID from the URL
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [customerRunningBalance, setCustomerRunningBalance] = useState<
    number | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // 🟢 Modal State for Recording Payments
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // 🟢 Memo Settlement States
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [convertAmountPaid, setConvertAmountPaid] = useState("0");
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("CASH");
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  // 🟢 Return Modal States
  const [returnItemModal, setReturnItemModal] = useState<any>(null);
  const [returnQty, setReturnQty] = useState<number>(1);

  const refreshOrder = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/order/${id}`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok)
        throw new Error(data?.message || data?.error || "Failed to load order");

      const rawOrder = data?.order;
      if (!rawOrder) throw new Error("Order data not found");

      // Normalize items
      const items = (rawOrder.items || []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        name: item.isService
          ? item.serviceName
          : item.product?.name || "Unknown Product",
        price: Number(item.price ?? 0),
        qty: Number(item.quantity ?? 0),
        total: Number(item.price ?? 0) * Number(item.quantity ?? 0),
        isService: item.isService || false,
        notes: item.notes || "",
      }));

      const subtotal = items.reduce(
        (sum: number, item: any) => sum + item.total,
        0,
      );
      const discount = Number(rawOrder.discount ?? 0);
      const total = Number(rawOrder.totalAmount ?? 0);
      const paid = (rawOrder.payments || []).reduce(
        (sum: number, pay: any) => sum + Number(pay.amount ?? 0),
        0,
      );
      const balance = Math.max(0, total - paid);

      const payments = (rawOrder.payments || []).map((pay: any) => ({
        id: pay.id,
        amount: Number(pay.amount ?? 0),
        method:
          pay.method === "CASH"
            ? "Cash"
            : pay.method === "BANK"
              ? "Bank Transfer"
              : "Online",
        date: new Date(pay.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        receivedBy: `${pay.receiver?.name || "Staff"} (${pay.receiver?.role || "Staff"})`,
      }));

      // Generate timeline dynamically
      const timeline: any[] = [];

      timeline.push({
        time: new Date(rawOrder.createdAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        event: `Order created by ${rawOrder.creator?.name || "Owner"}`,
        type: "create",
        dateObj: new Date(rawOrder.createdAt),
      });

      (rawOrder.payments || []).forEach((pay: any) => {
        timeline.push({
          time: new Date(pay.createdAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          event: `Payment of Rs. ${pay.amount.toLocaleString()} (${pay.method === "CASH" ? "Cash" : pay.method === "BANK" ? "Bank" : "Online"}) recorded by ${pay.receiver?.name || "Staff"}`,
          type: "payment",
          dateObj: new Date(pay.createdAt),
        });
      });

      timeline.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

      const normalized = {
        id: rawOrder.id,
        // 🟢 FIX: Use the clean Order Number for the UI!
        orderNumber: `ORD-${rawOrder.orderNumber || rawOrder.id.substring(0, 4)}`,
        status: rawOrder.status,
        paymentStatus: rawOrder.paymentStatus,
        date: new Date(rawOrder.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        customer: {
          name: rawOrder.customer ? rawOrder.customer.name : "Walk-in Customer",
          phone: rawOrder.customer ? rawOrder.customer.phone : "N/A",
          type: rawOrder.customer
            ? rawOrder.customer.isDefaulter
              ? "Defaulter"
              : "Standard Customer"
            : "Walk-in",
        },
        items,
        financials: { subtotal, discount, total, paid, balance },
        payments,
        timeline,
        notes: rawOrder.notes || "No internal staff notes recorded.",
      };

      setOrder(normalized);

      // Fetch customer ledger running balance if available
      if (rawOrder.customerId || rawOrder.customer?.id) {
        const custId = rawOrder.customerId || rawOrder.customer?.id;
        try {
          const custRes = await fetch(`${API_BASE_URL}/customer/${custId}`, {
            headers: getAuthHeaders(),
          });
          const custData = await custRes.json();
          if (
            custData.success &&
            custData.customer?.metrics?.outstandingBalance !== undefined
          ) {
            setCustomerRunningBalance(
              custData.customer.metrics.outstandingBalance,
            );
          }
        } catch (e) {
          console.warn("Could not prefetch customer balance for receipt:", e);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load order");
      setOrder(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refreshOrder();
  }, [refreshOrder]);

  const handleReturnToStock = async () => {
    const confirm = window.confirm(
      "Are you sure you want to return this Memo to stock? All reserved instances will be unlocked back to AVAILABLE and this order will be marked as RETURNED.",
    );
    if (!confirm) return;

    setIsSubmittingStatus(true);
    try {
      const response = await fetch(`${API_BASE_URL}/order/${id}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: "RETURNED" }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to return memo to stock");
      }
      await refreshOrder();
    } catch (err: any) {
      alert(err.message || "Failed to return order");
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  const handleOpenConvertModal = () => {
    setConvertAmountPaid("0");
    setConvertPaymentMethod("CASH");
    setIsConvertModalOpen(true);
  };

  const handleConvertToFinalSale = async () => {
    setIsSubmittingStatus(true);
    try {
      const response = await fetch(`${API_BASE_URL}/order/${id}/settle-memo`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amountPaid: Number(convertAmountPaid) || 0,
          paymentMethod: convertPaymentMethod,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || "Failed to convert memo to final sale",
        );
      }
      setIsConvertModalOpen(false);
      await refreshOrder();
    } catch (err: any) {
      alert(err.message || "Failed to convert memo to final sale");
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  const handleOpenReturnModal = (item: any) => {
    setReturnItemModal(item);
    setReturnQty(1);
  };

  const handleProcessReturn = async () => {
    if (!returnItemModal) return;
    setIsSubmittingStatus(true);
    try {
      const payload = {
        itemsToReturn: [
          {
            productId: returnItemModal.productId,
            quantity: returnQty,
          },
        ],
      };

      const response = await fetch(`${API_BASE_URL}/order/${id}/return`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to process return");
      }
      setReturnItemModal(null);
      await refreshOrder();
    } catch (err: any) {
      alert(err.message || "Failed to process return");
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  const handleMarkAsCompleted = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/order/${id}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message || "Failed to update status");
      }
      await refreshOrder();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelOrder = async () => {
    const confirm = window.confirm(
      "Are you sure you want to cancel this order? Stock will be returned to inventory.",
    );
    if (confirm) {
      try {
        const response = await fetch(`${API_BASE_URL}/order/${id}/status`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ status: "CANCELLED" }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.message || "Failed to cancel order");
        }
        await refreshOrder();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm animate-pulse">
          Loading order details...
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-rose-600 font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error || "Order not found"}
        </div>
        <Link href="/orders" className="text-sm text-blue-600 hover:underline">
          Back to Orders
        </Link>
      </div>
    );
  }

  const waMessage = encodeURIComponent(
    `Hello ${order.customer.name}, your order ${order.orderNumber} is confirmed. Total: Rs. ${order.financials.total.toLocaleString()}. View receipt: bizflow.com/p/shop/${order.id}`,
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10 mt-2">
      {/* 🟢 TOP ACTION BAR */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border shadow-sm transition-colors ${order.status === "CANCELLED" ? "bg-slate-100 border-slate-200" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/orders")}
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              {/* 🟢 Display the clean Order Number here! */}
              <h1
                className={`text-xl font-bold tracking-tight ${order.status === "CANCELLED" ? "text-slate-400 line-through" : "text-slate-900"}`}
              >
                {order.orderNumber}
              </h1>

              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1 border ${
                  order.status === "FINAL" || order.status === "COMPLETED"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : order.status === "MEMO"
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : order.status === "RETURNED"
                        ? "bg-purple-100 text-purple-700 border-purple-200"
                        : order.status === "CANCELLED"
                          ? "bg-slate-200 text-slate-600 border-slate-300"
                          : "bg-blue-100 text-blue-700 border-blue-200"
                }`}
              >
                {(order.status === "FINAL" || order.status === "COMPLETED") && (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {order.status === "MEMO" && (
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                )}
                {order.status === "RETURNED" && (
                  <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                )}
                {order.status === "CANCELLED" && (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {order.status === "MEMO"
                  ? "MEMO (Amanat)"
                  : order.status === "RETURNED"
                    ? "RETURNED TO STOCK"
                    : order.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{order.date}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status === "MEMO" && (
            <>
              <button
                onClick={handleReturnToStock}
                disabled={isSubmittingStatus}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs sm:text-sm font-semibold hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Return to Stock
              </button>
              <button
                onClick={handleOpenConvertModal}
                disabled={isSubmittingStatus}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200 disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" /> Convert to Final Sale
              </button>
            </>
          )}

          {order.status === "PENDING" && (
            <button
              onClick={handleMarkAsCompleted}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark as Completed
            </button>
          )}

          {order.status !== "CANCELLED" && (
            <>
              <Link
                href={`/invoice/${order.id}`}
                target="_blank"
                className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors bg-white shadow-sm"
              >
                <Printer className="w-4 h-4" /> Print
              </Link>
              <a
                href={generateWhatsAppReceipt(
                  order,
                  order.customer,
                  customerRunningBalance,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-xl text-sm font-semibold hover:bg-[#20bd5a] transition-colors shadow-sm"
              >
                <MessageCircle className="w-4 h-4" /> Share via WhatsApp
              </a>
            </>
          )}
        </div>
      </div>

      {/* ⚡ PENDING MEMO BANNER */}
      {order.status === "MEMO" && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl mt-0.5 border border-amber-200">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-950 flex items-center gap-2">
                  Pending Memo (Amanat)
                  <span className="text-xs bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-md">
                    Stock Locked
                  </span>
                </h3>
                <p className="text-sm text-amber-800/90 mt-1 max-w-2xl leading-relaxed">
                  Physical stock items are locked (
                  <code className="font-mono text-xs bg-amber-200/60 px-1 py-0.5 rounded text-amber-900">
                    MEMO_LOCKED
                  </code>
                  ) and no monetary debt has been recorded in the customer's
                  ledger. You can return the items back to inventory or convert
                  this into a permanent Final Sale.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleReturnToStock}
                disabled={isSubmittingStatus}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-rose-600 border border-rose-200 rounded-xl text-sm font-bold hover:bg-rose-50 transition-colors shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Return to Stock
              </button>
              <button
                onClick={handleOpenConvertModal}
                disabled={isSubmittingStatus}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200 disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" /> Convert to Final Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ↩ RETURNED MEMO BANNER */}
      {order.status === "RETURNED" && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-center gap-2 text-purple-800 font-medium">
          <RotateCcw className="w-5 h-5 text-purple-600" /> This memo was
          returned to stock. Reserved inventory was unlocked back to AVAILABLE
          and no Udhar debt was created.
        </div>
      )}

      {/* 🔴 CANCELLED WARNING BANNER */}
      {order.status === "CANCELLED" && (
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 flex items-center justify-center gap-2 text-slate-600 font-medium">
          <AlertCircle className="w-5 h-5" /> This order was cancelled. Items
          have been returned to inventory.
        </div>
      )}

      <div
        className={`flex flex-col lg:flex-row gap-6 items-start ${order.status === "CANCELLED" ? "opacity-70 pointer-events-none" : ""}`}
      >
        {/* LEFT COLUMN: FINANCIAL LEDGER */}
        <div className="w-full lg:flex-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-slate-400" /> Items Ordered
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item: any) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {item.name}
                      </p>
                      {item.isService && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Service
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-slate-500 italic mt-0.5">
                        Note: {item.notes}
                      </p>
                    )}
                    <p className="text-sm text-slate-500 mt-0.5">
                      Rs. {item.price.toLocaleString()} x {item.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-900">
                      Rs. {item.total.toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleOpenReturnModal(item)}
                      disabled={
                        order.status === "RETURNED" ||
                        order.status === "CANCELLED"
                      }
                      className="text-slate-400 hover:text-rose-500 p-1.5 rounded-md hover:bg-rose-50 transition-colors tooltip-trigger disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      title="Process Return/Refund"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>Rs. {order.financials.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-rose-600 font-medium">
                <span>Discount</span>
                <span>- Rs. {order.financials.discount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-slate-900 pt-3 border-t border-slate-200 mt-2">
                <span>Grand Total</span>
                <span>Rs. {order.financials.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-600" /> Payment History
              </h2>
              {/* 🟢 OPEN THE PAYMENT MODAL HERE! */}
              {order.financials.balance > 0 &&
                order.status !== "CANCELLED" &&
                order.status !== "MEMO" &&
                order.status !== "RETURNED" && (
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    Record Payment
                  </button>
                )}
            </div>

            <div className="p-4 space-y-3">
              {order.payments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                      {payment.method === "Cash" ? (
                        <Banknote className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Rs. {payment.amount.toLocaleString()}{" "}
                        <span className="text-slate-500 font-normal">
                          via {payment.method}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {payment.date} • by {payment.receivedBy}
                      </p>
                    </div>
                  </div>
                  <button className="text-slate-400 hover:text-slate-900">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-rose-700">
                  Remaining Balance
                </p>
                <p className="text-xs text-rose-600/80 mt-0.5">
                  Customer owes this amount
                </p>
              </div>
              <span className="text-2xl font-black text-rose-700 tracking-tight">
                Rs. {order.financials.balance.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CONTEXT & AUDIT */}
        <div className="w-full lg:w-[380px] space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <User className="w-4 h-4" /> Customer
            </h3>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-slate-900 text-lg">
                  {order.customer.name}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {order.customer.phone}
                </p>
              </div>
              <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-1 rounded-md">
                {order.customer.type}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
              <History className="w-4 h-4" /> Audit Trail
            </h3>
            <div className="relative border-l-2 border-slate-100 ml-3 space-y-6">
              {order.timeline.map((log: any, index: number) => (
                <div key={index} className="relative pl-5">
                  <div
                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                      log.type === "payment"
                        ? "bg-emerald-500"
                        : log.type === "status"
                          ? "bg-blue-500"
                          : "bg-slate-300"
                    }`}
                  />
                  <p className="text-sm font-medium text-slate-800 leading-tight mb-1">
                    {log.event}
                  </p>
                  <p className="text-xs text-slate-500">{log.time}</p>
                </div>
              ))}
            </div>
          </div>

          {order.status !== "CANCELLED" && (
            <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm">
              <h3 className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Danger Zone
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Cancelling this order will return items to inventory. Refunds
                must be processed manually.
              </p>
              <button
                onClick={handleCancelOrder}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Cancel Order
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 🟢 CONVERT TO FINAL SALE MODAL */}
      {isConvertModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Convert to Final Sale
                  </h3>
                  <p className="text-xs text-slate-500">
                    Order {order.orderNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConvertModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total Order Amount:</span>
                  <span className="font-bold text-slate-900">
                    Rs. {order.financials.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Customer:</span>
                  <span className="font-medium text-slate-900">
                    {order.customer.name}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Amount Paid Right Now (Rs.)
                </label>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                  <span className="px-3 text-slate-500 text-sm font-medium border-r border-slate-300">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={order.financials.total}
                    value={convertAmountPaid}
                    onChange={(e) => setConvertAmountPaid(e.target.value)}
                    placeholder="0"
                    className="w-full py-2.5 px-3 text-base font-bold text-slate-900 bg-transparent outline-none"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setConvertAmountPaid("0")}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-medium text-slate-600"
                  >
                    Full Udhar (Rs. 0)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConvertAmountPaid(String(order.financials.total))
                    }
                    className="text-xs px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-medium text-emerald-700"
                  >
                    Full Paid (Rs. {order.financials.total.toLocaleString()})
                  </button>
                </div>
              </div>

              {Number(convertAmountPaid) > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "CASH", label: "Cash" },
                      { id: "BANK", label: "Bank" },
                      { id: "ONLINE", label: "Online" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setConvertPaymentMethod(m.id)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          convertPaymentMethod === m.id
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Remaining Udhar (Added to Khata):</span>
                  <span className="font-bold text-rose-600">
                    Rs.{" "}
                    {Math.max(
                      0,
                      order.financials.total - (Number(convertAmountPaid) || 0),
                    ).toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  Converting to Final Sale transitions inventory from{" "}
                  <span className="font-mono text-slate-700">MEMO_LOCKED</span>{" "}
                  to <span className="font-mono text-slate-700">SOLD</span> and
                  creates balanced double-entry ledger postings.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConvertModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConvertToFinalSale}
                disabled={isSubmittingStatus}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmittingStatus ? "Processing..." : "Confirm Final Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 RETURN ITEM MODAL */}
      {returnItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-rose-500" /> Process Return
              </h3>
              <button
                onClick={() => setReturnItemModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {returnItemModal.name}
                </p>
                <p className="text-xs text-slate-500">
                  Max Qty to return: {returnItemModal.qty}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Return Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnItemModal.qty}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={handleProcessReturn}
                disabled={
                  isSubmittingStatus ||
                  returnQty < 1 ||
                  returnQty > returnItemModal.qty
                }
                className="w-full flex justify-center items-center gap-2 bg-rose-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingStatus ? "Processing..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 RENDER THE RECORD PAYMENT MODAL */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        orderId={order.id}
        pendingAmount={order.financials.balance}
        onSuccess={() => {
          setIsPaymentModalOpen(false);
          refreshOrder(); // Refresh the page to show the new payment!
        }}
      />
    </div>
  );
}
