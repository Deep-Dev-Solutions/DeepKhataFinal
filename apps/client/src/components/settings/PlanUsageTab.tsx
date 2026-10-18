"use client";

import { Loader2 } from "lucide-react";
import { usePlanUsage } from "@/hooks/queries/usePlan";
import {
  RESOURCE_LABEL,
  daysUntil,
  upgradeWhatsappUrl,
  type PlanResource,
} from "@/lib/billing";
import { formatShortDate } from "@/lib/dues";

const RESOURCES: { key: PlanResource; limit: "maxBranches" | "maxUsers" | "maxProducts" }[] = [
  { key: "branches", limit: "maxBranches" },
  { key: "users", limit: "maxUsers" },
  { key: "products", limit: "maxProducts" },
];

function shopNameFromCache(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.businessName ?? null;
  } catch {
    return null;
  }
}

export default function PlanUsageTab() {
  const { data, isPending, error } = usePlanUsage();

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
        {error?.message || "Could not load plan details."}
      </div>
    );
  }

  const { plan, limits, usage, subscription } = data;
  const trialDays =
    subscription.status === "TRIAL" ? daysUntil(subscription.trialEndsAt) : null;
  const whatsapp = upgradeWhatsappUrl(shopNameFromCache(), plan.name);

  return (
    <div className="space-y-6" data-testid="plan-usage-tab">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Current plan
            </p>
            <h2
              data-testid="plan-name"
              className="text-2xl font-black text-slate-900"
            >
              {plan.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Status:{" "}
              <span
                data-testid="plan-status"
                className="font-semibold text-slate-800"
              >
                {subscription.status}
              </span>
              {subscription.currentPeriodEnd && (
                <> &middot; renews {formatShortDate(subscription.currentPeriodEnd)}</>
              )}
            </p>
            {trialDays !== null && (
              <p
                data-testid="trial-days-left"
                className="mt-2 inline-block rounded-lg bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700"
              >
                {trialDays} {trialDays === 1 ? "day" : "days"} left in your trial
              </p>
            )}
          </div>
          {whatsapp ? (
            <a
              data-testid="plan-upgrade-whatsapp"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Upgrade on WhatsApp
            </a>
          ) : (
            <span
              data-testid="plan-upgrade-whatsapp"
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-center text-sm text-slate-500"
            >
              Contact your agency to upgrade
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <h3 className="text-sm font-bold text-slate-900">Usage</h3>
        {RESOURCES.map(({ key, limit }) => {
          const used = usage[key];
          const max = limits[limit];
          const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
          const full = max !== null && used >= max;
          return (
            <div key={key} data-testid="usage-meter" data-resource={key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {RESOURCE_LABEL[key]}
                </span>
                <span className="text-slate-500">
                  {used} / {max ?? "Unlimited"}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={max ?? undefined}
              >
                <div
                  className={`h-full rounded-full ${full ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-600"}`}
                  style={{ width: max === null ? "0%" : `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-sm font-bold text-slate-900">Invoices</h3>
        <p className="mt-1 text-sm text-slate-500">
          Invoices are sent by email/WhatsApp.
        </p>
      </section>
    </div>
  );
}
