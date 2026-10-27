"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card data-testid="checklist">
      <CardContent className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-subtitle font-semibold text-gray-900">Getting started</h2>
          <p className="text-caption text-gray-500">
            {data.completed} of {data.total} done
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.sampleDataLoaded && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="sample-data-wipe"
              disabled={wipe.isPending}
              onClick={() => {
                setWipeError("");
                wipe.mutate(undefined, {
                  onError: (e) => setWipeError(e.message),
                });
              }}
              className="text-danger hover:bg-danger-bg"
            >
              {wipe.isPending ? "Removing..." : "Remove sample data"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="checklist-dismiss"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            Dismiss
          </Button>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full bg-brand-700" style={{ width: `${pct}%` }} />
      </div>
      {wipeError && (
        <p className="mt-2 text-caption text-danger" role="alert">
          {wipeError}
        </p>
      )}
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
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
                className="flex items-center gap-2 rounded px-2 py-1.5 text-body hover:bg-gray-50"
              >
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                )}
                <span
                  className={item.done ? "text-gray-400 line-through" : "text-gray-700"}
                >
                  {copy.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      </CardContent>
    </Card>
  );
}
