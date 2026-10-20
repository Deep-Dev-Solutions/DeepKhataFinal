"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  useChecklist,
  useDismissChecklist,
  useWipeSampleData,
} from "@/hooks/queries/usePlan";
import type { ChecklistKey } from "@/lib/billing";

const COPY: Record<ChecklistKey, { label: string; href: string }> = {
  first_product: { label: "Add your first product (maal)", href: "/products" },
  first_sale: { label: "Make your first sale", href: "/orders/new" },
  udhar_customer: { label: "Add a customer with udhar", href: "/customers" },
  staff_user: { label: "Invite a staff member", href: "/settings" },
  notification_prefs: { label: "Set your notification preferences", href: "/settings" },
};

export default function GettingStartedChecklist() {
  const { role } = useAuth();
  const isOwner = role === "OWNER" || role === "SUPER_ADMIN";
  const { data } = useChecklist({ enabled: isOwner });
  const dismiss = useDismissChecklist();
  const wipe = useWipeSampleData();
  const [wipeError, setWipeError] = useState("");

  if (!isOwner || !data || data.dismissed || data.completed >= data.total) {
    return null;
  }

  const pct = data.total ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <section
      data-testid="checklist"
      className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Getting started</h2>
          <p className="text-sm text-slate-500">
            {data.completed} of {data.total} done
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.sampleDataLoaded && (
            <button
              type="button"
              data-testid="sample-data-wipe"
              disabled={wipe.isPending}
              onClick={() => {
                setWipeError("");
                wipe.mutate(undefined, {
                  onError: (e) => setWipeError(e.message),
                });
              }}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
            >
              {wipe.isPending ? "Removing..." : "Remove sample data"}
            </button>
          )}
          <button
            type="button"
            data-testid="checklist-dismiss"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
      </div>
      {wipeError && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {wipeError}
        </p>
      )}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {data.items.map((item) => {
          const copy = COPY[item.key];
          return (
            <li
              key={item.key}
              data-testid="checklist-item"
              data-key={item.key}
              data-done={item.done ? "true" : "false"}
            >
              <Link
                href={copy.href}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
              >
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span
                  className={item.done ? "text-slate-400 line-through" : "text-slate-700"}
                >
                  {copy.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
