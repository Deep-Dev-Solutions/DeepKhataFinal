"use client";

import { formatRs, type DuesSummary } from "@/lib/dues";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  summary: DuesSummary | null;
}

const CARDS = [
  { id: "dues-card-receive", label: "Lena hai", tone: "text-success-fg", pick: (s: DuesSummary) => s.toReceive },
  { id: "dues-card-pay", label: "Dena hai", tone: "text-warning-fg", pick: (s: DuesSummary) => s.toPay },
  { id: "dues-card-overdue", label: "Overdue", tone: "text-danger-fg", pick: (s: DuesSummary) => s.overdueToReceive },
  { id: "dues-card-week", label: "Is hafte", tone: "text-brand-700", pick: (s: DuesSummary) => s.dueThisWeekToReceive },
] as const;

/** Same card rhythm as the dashboard StatsCards, so Lena / Dena reads like home. */
export default function DuesSummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => (
        <Card key={c.id}>
          <CardContent className="px-4 py-3">
            <p
              data-testid={c.id}
              className="text-caption font-medium uppercase tracking-wide text-gray-500"
            >
              {c.label}
            </p>
            <p className={`mt-0.5 font-mono text-title font-semibold tracking-tight ${c.tone}`}>
              {summary ? formatRs(c.pick(summary)) : "—"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
