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
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export default function VendorProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [vendor, setVendor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseDescription, setPurchaseDescription] = useState("");
  const [purchaseError, setPurchaseError] = useState("");

  const fetchVendorData = useCallback(async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/vendors/${id}`, {
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

  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRecordingPurchase(true);
    setPurchaseError("");

    try {
      const response = await fetch(`${API_BASE_URL}/vendors/${id}/purchase`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: Number(purchaseAmount),
          description: purchaseDescription,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to record purchase",
        );
      }

      setPurchaseAmount("");
      setPurchaseDescription("");
      await fetchVendorData();
    } catch (error) {
      setPurchaseError(
        error instanceof Error ? error.message : "Failed to record purchase",
      );
    } finally {
      setIsRecordingPurchase(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        <div className="animate-pulse">Loading vendor profile...</div>
      </div>
    );
  }

  if (pageError || !vendor) {
    return (
      <div className="p-6 text-center max-w-md mx-auto mt-10">
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mb-4">
          {pageError || "Vendor not found"}
        </div>
        <Link
          href="/vendors"
          className="text-indigo-600 font-semibold hover:underline"
        >
          &larr; Back to Vendors
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-white border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/vendors"
            className="p-2 text-slate-400 hover:text-slate-900 bg-white rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                {vendor.businessName}
              </h1>
              {vendor.balance > 0 ? (
                <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-md border border-rose-200">
                  Owe Rs. {vendor.balance.toLocaleString()}
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-200">
                  Settled
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:w-[350px] flex flex-col gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Vendor Details
            </h3>
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3 text-slate-700">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {vendor.contactName || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Contact Person</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {vendor.phone || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Phone Number</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-slate-700 pt-2 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="font-medium leading-relaxed">
                    {vendor.address || "Not provided"}
                  </p>
                  <p className="text-xs text-slate-500">Address</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Record Credit Purchase
            </h3>
            <form onSubmit={handleRecordPurchase} className="space-y-4">
              {purchaseError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs">
                  {purchaseError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Amount (Rs.)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Description / Invoice Ref
                </label>
                <input
                  type="text"
                  value={purchaseDescription}
                  onChange={(e) => setPurchaseDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g. Screens Batch A"
                />
              </div>
              <button
                type="submit"
                disabled={isRecordingPurchase || !purchaseAmount}
                className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {isRecordingPurchase ? "Recording..." : "Add to Ledger"}
              </button>
            </form>
          </div>
        </div>

        <div className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/70">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">
              Ledger (Accounts Payable)
            </h2>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date & Time</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 font-semibold text-right">
                      Credit (We Owe)
                    </th>
                    <th className="px-5 py-3 font-semibold text-right">
                      Debit (We Paid)
                    </th>
                    <th className="px-5 py-3 font-semibold text-right">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!vendor.ledger || vendor.ledger.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-slate-500"
                      >
                        No transactions found for this vendor.
                      </td>
                    </tr>
                  ) : (
                    vendor.ledger.map((item: any) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-3.5 text-xs text-slate-500 font-medium">
                          {item.formattedDate}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-800 text-xs sm:text-sm">
                            {item.description}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {item.credit > 0 ? (
                            <span className="font-bold text-rose-600">
                              Rs. {item.credit.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {item.debit > 0 ? (
                            <span className="font-bold text-emerald-600">
                              Rs. {item.debit.toLocaleString()}
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
        </div>
      </div>
    </div>
  );
}
