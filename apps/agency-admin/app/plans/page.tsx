"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import InlineError from "@/components/InlineError";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import type { PlanPreset } from "@/types/agency";

interface PlanForm {
  code: string;
  name: string;
  priceMonthly: string;
  priceYearly: string;
  maxBranches: string;
  maxUsers: string;
  maxProducts: string;
  trialDays: string;
  isPublic: boolean;
  active: boolean;
}

const EMPTY_FORM: PlanForm = {
  code: "",
  name: "",
  priceMonthly: "",
  priceYearly: "",
  maxBranches: "",
  maxUsers: "",
  maxProducts: "",
  trialDays: "",
  isPublic: true,
  active: true,
};

const toForm = (p: PlanPreset): PlanForm => ({
  code: p.code,
  name: p.name,
  priceMonthly: p.priceMonthly ?? "",
  priceYearly: p.priceYearly ?? "",
  maxBranches: p.maxBranches == null ? "" : String(p.maxBranches),
  maxUsers: p.maxUsers == null ? "" : String(p.maxUsers),
  maxProducts: p.maxProducts == null ? "" : String(p.maxProducts),
  trialDays: p.trialDays == null ? "" : String(p.trialDays),
  isPublic: p.isPublic,
  active: p.active,
});

const payload = (form: PlanForm) => ({
  code: form.code.trim().toUpperCase(),
  name: form.name.trim(),
  priceMonthly: form.priceMonthly.trim() === "" ? null : form.priceMonthly.trim(),
  priceYearly: form.priceYearly.trim() === "" ? null : form.priceYearly.trim(),
  maxBranches: form.maxBranches === "" ? null : Number(form.maxBranches),
  maxUsers: form.maxUsers === "" ? null : Number(form.maxUsers),
  maxProducts: form.maxProducts === "" ? null : Number(form.maxProducts),
  trialDays: form.trialDays === "" ? null : Number(form.trialDays),
  isPublic: form.isPublic,
  active: form.active,
});

const inputCls =
  "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-body focus:outline-none focus:ring-2 focus:ring-brand-300";

export default function PlansPage() {
  const { token, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();

  const [plans, setPlans] = useState<PlanPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      if (!isAuthLoading) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<PlanPreset[]>("/agency/plans");
      setPlans(data || []);
      setError("");
    } catch (err: unknown) {
      setError(describeError(err, "the plan presets"));
    } finally {
      setLoading(false);
    }
  }, [token, isAuthLoading]);

  useEffect(() => {
    // Deferred so load() does not set state synchronously (cascading renders).
    void Promise.resolve().then(() => load()).catch(console.error);
  }, [load]);

  const startEdit = (plan: PlanPreset) => {
    setCreating(false);
    setEditingId(plan.id);
    setForm(toForm(plan));
  };

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setForm(EMPTY_FORM);
  };

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (creating) {
        await api.post<PlanPreset>("/agency/plans", payload(form));
        showToast(`${form.name} created`, "success");
      } else if (editingId) {
        const body = payload(form);
        const { code, ...rest } = body;
        void code;
        await api.patch<PlanPreset>(`/agency/plans/${editingId}`, rest);
        showToast(`${form.name} updated`, "success");
      }
      cancel();
      await load();
    } catch (err: unknown) {
      showToast(describeError(err, "the plan"), "error");
    } finally {
      setSaving(false);
    }
  };

  const formCard = (
    <div className="bg-card border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">
        {creating ? "New plan preset" : `Editing ${form.code}`}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Code
          </label>
          <input
            data-testid="plan-code"
            value={form.code}
            disabled={!creating}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="GROWTH"
            className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500`}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            data-testid="plan-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Growth"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Monthly price (PKR)
          </label>
          <input
            data-testid="plan-price-monthly"
            value={form.priceMonthly}
            onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
            placeholder="blank = not sold"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Yearly price (PKR)
          </label>
          <input
            data-testid="plan-price-yearly"
            value={form.priceYearly}
            onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
            placeholder="blank = not sold"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Max branches
          </label>
          <input
            data-testid="plan-max-branches"
            type="number"
            value={form.maxBranches}
            onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
            placeholder="blank = unlimited"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Max users
          </label>
          <input
            data-testid="plan-max-users"
            type="number"
            value={form.maxUsers}
            onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
            placeholder="blank = unlimited"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Max products
          </label>
          <input
            data-testid="plan-max-products"
            type="number"
            value={form.maxProducts}
            onChange={(e) => setForm({ ...form, maxProducts: e.target.value })}
            placeholder="blank = unlimited"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-700 mb-1">
            Trial days
          </label>
          <input
            data-testid="plan-trial-days"
            type="number"
            value={form.trialDays}
            onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
            placeholder="0"
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex items-center gap-6 text-body">
        <label className="inline-flex items-center gap-2">
          <input
            data-testid="plan-public"
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
          />
          Public
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            data-testid="plan-active"
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.name.trim() || (creating && !form.code.trim())}
          data-testid="plan-save"
          className="inline-flex items-center gap-2 bg-brand-700 text-white px-3.5 py-2 rounded-lg text-body font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save preset
        </button>
        <button
          type="button"
          onClick={cancel}
          data-testid="plan-cancel"
          className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-3.5 py-2 rounded-lg text-body font-medium hover:bg-gray-50"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div data-testid="plans-page" className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-heading font-semibold text-gray-900 tracking-tight">
            Plan presets
          </h2>
          <p className="text-body text-gray-500 mt-0.5">
            Named plans the console offers when setting a deal or logging a payment.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          data-testid="plan-create-open"
          className="inline-flex items-center gap-2 bg-brand-700 text-white px-3.5 py-2 rounded-lg text-body font-medium hover:bg-brand-700 shadow-sm"
        >
          <Plus size={16} />
          New plan
        </button>
      </div>

      {error && <InlineError area="plans" message={error} onRetry={load} />}

      {(creating || editingId) && formCard}

      {loading ? (
        <div className="flex items-center justify-center p-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading plans...
        </div>
      ) : error ? null : (
        <div className="bg-card border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4 text-right">Monthly</th>
                  <th className="px-6 py-4 text-right">Yearly</th>
                  <th className="px-6 py-4 text-right">Limits</th>
                  <th className="px-6 py-4 text-right">Shops</th>
                  <th className="px-6 py-4">State</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((p) => (
                  <tr key={p.id} data-testid="plan-row" data-plan-code={p.code}>
                    <td className="px-6 py-4 font-semibold text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 font-mono text-gray-500">{p.code}</td>
                    <td className="px-6 py-4 text-right">
                      {p.priceMonthly == null ? "-" : `Rs ${p.priceMonthly}`}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {p.priceYearly == null ? "-" : `Rs ${p.priceYearly}`}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">
                      {p.maxBranches ?? "∞"} / {p.maxUsers ?? "∞"} / {p.maxProducts ?? "∞"}
                    </td>
                    <td className="px-6 py-4 text-right">{p.subscribers ?? 0}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-caption font-semibold border ${
                          p.active
                            ? "bg-success-bg text-success border-success"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {p.active ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        data-testid="plan-edit"
                        className="px-2.5 py-1.5 text-caption font-medium text-brand-700 bg-brand-50 rounded-lg"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No plan presets yet. Create the first one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
