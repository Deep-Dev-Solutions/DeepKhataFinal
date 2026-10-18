"use client";

import { formatRs, type DuesSummary } from "@/lib/dues";

interface Props {
  summary: DuesSummary | null;
}

const CARDS = [
  { id: "dues-card-receive", label: "Lena hai", tone: "text-emerald-700", pick: (s: DuesSummary) => s.toReceive },
  { id: "dues-card-pay", label: "Dena hai", tone: "text-amber-700", pick: (s: DuesSummary) => s.toPay },
  { id: "dues-card-overdue", label: "Overdue", tone: "text-rose-700", pick: (s: DuesSummary) => s.overdueToReceive },
  { id: "dues-card-week", label: "Is hafte", tone: "text-blue-700", pick: (s: DuesSummary) => s.dueThisWeekToReceive },
] as const;

export default function DuesSummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div
          key={c.id}
          data-testid={c.id}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {c.label}
          </p>
          <p className={`mt-1 text-xl sm:text-2xl font-black ${c.tone}`}>
            {summary ? formatRs(c.pick(summary)) : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
