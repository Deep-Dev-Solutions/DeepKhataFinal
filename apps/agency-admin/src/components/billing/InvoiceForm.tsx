"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { BillingCycle, Invoice, MONEY_RE, TenantOption } from "./types";

interface Props {
  /** When set, the business is fixed (per-tenant page). */
  fixedBusinessId?: string;
  onCreated: (invoice: Invoice) => void;
  onCancel: () => void;
}

interface TenantPlanInfo {
  subscription?: { planId?: string | null; plan?: { id?: string; name?: string } | null } | null;
}

const input =
  "w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";

export default function InvoiceForm({ fixedBusinessId, onCreated, onCancel }: Props) {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [businessId, setBusinessId] = useState(fixedBusinessId ?? "");
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const [periods, setPeriods] = useState("1");
  const [periodStart, setPeriodStart] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [dueDays, setDueDays] = useState("7");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fixedBusinessId) return;
    api
      .get<TenantOption[]>("/agency/tenants")
      .then(setTenants)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load tenants"));
  }, [fixedBusinessId]);

  // Prefill the plan from the tenant's subscription when it is exposed.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    api
      .get<TenantPlanInfo>(`/agency/tenants/${businessId}`)
      .then((t) => {
        if (cancelled) return;
        const id = t.subscription?.planId ?? t.subscription?.plan?.id ?? "";
        setPlanId(id ?? "");
        setPlanName(t.subscription?.plan?.name ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setPlanId("");
          setPlanName("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const hasLine = description.trim() !== "" || unitPrice.trim() !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!businessId) return setError("Select a business");
    if (discount && !MONEY_RE.test(discount)) return setError("Discount must be a number with up to 2 decimals");
    if (hasLine) {
      if (!description.trim()) return setError("Line description is required");
      if (!MONEY_RE.test(unitPrice)) return setError("Unit price must be a number with up to 2 decimals");
      if (!/^\d+$/.test(quantity) || Number(quantity) < 1) return setError("Quantity must be a whole number");
    }
    const body: Record<string, unknown> = {
      businessId,
      billingCycle: cycle,
      periods: Number(periods) || 1,
    };
    if (planId) body.planId = planId;
    if (periodStart) body.periodStart = periodStart;
    if (discount) body.discount = discount;
    if (dueDays) body.dueDays = Number(dueDays);
    if (hasLine) body.lines = [{ description: description.trim(), quantity: Number(quantity), unitPrice }];

    setSubmitting(true);
    try {
      const invoice = await api.post<Invoice>("/agency/billing/invoices", body);
      onCreated(invoice);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900">Generate Invoice</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form data-testid="invoice-form" onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div role="alert" data-testid="invoice-form-error" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-100">
              {error}
            </div>
          )}
          {!fixedBusinessId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business</label>
              <select
                required
                value={businessId}
                data-testid="invoice-business"
                onChange={(e) => setBusinessId(e.target.value)}
                className={input}
              >
                <option value="">Select a business...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {planName && (
            <p className="text-xs text-slate-500">
              Plan: <span className="font-semibold text-slate-700">{planName}</span> (from subscription)
            </p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Billing cycle</label>
              <select
                value={cycle}
                data-testid="invoice-cycle"
                onChange={(e) => setCycle(e.target.value as BillingCycle)}
                className={input}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Periods</label>
              <input
                type="number"
                min="1"
                step="1"
                value={periods}
                data-testid="invoice-periods"
                onChange={(e) => setPeriods(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Period start</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={input} />
            </div>
          </div>

          <fieldset className="border border-slate-200 rounded-lg p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Custom line (optional)
            </legend>
            <input
              type="text"
              value={description}
              data-testid="invoice-line-description"
              onChange={(e) => setDescription(e.target.value)}
              className={input}
              placeholder="Description, e.g. Setup and training"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                data-testid="invoice-line-quantity"
                onChange={(e) => setQuantity(e.target.value)}
                className={input}
                placeholder="Qty"
              />
              <input
                type="text"
                inputMode="decimal"
                value={unitPrice}
                data-testid="invoice-line-price"
                onChange={(e) => setUnitPrice(e.target.value)}
                className={input}
                placeholder="Unit price, e.g. 3000"
              />
            </div>
            <p className="text-xs text-slate-400">Leave empty to bill the plan price for the chosen cycle.</p>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Discount (PKR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                data-testid="invoice-discount"
                onChange={(e) => setDiscount(e.target.value)}
                className={input}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due in (days)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={dueDays}
                data-testid="invoice-due-days"
                onChange={(e) => setDueDays(e.target.value)}
                className={input}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="invoice-submit"
              className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {submitting ? "Generating..." : "Generate Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
