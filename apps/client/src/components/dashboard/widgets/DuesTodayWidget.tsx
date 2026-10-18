"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchDues,
  formatRs,
  karachiDateString,
  type DueItem,
} from "@/lib/dues";

function pickToday(items: DueItem[]): DueItem[] {
  const today = karachiDateString(0);
  return items
    .filter(
      (i) =>
        (i.daysOverdue ?? 0) > 0 ||
        (i.dueDate ? i.dueDate.slice(0, 10) === today : false),
    )
    .sort(
      (a, b) =>
        (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) ||
        Number(b.amountOpen) - Number(a.amountOpen),
    )
    .slice(0, 5);
}

function Column({
  title,
  rows,
  loading,
  testId,
  tone,
  Icon,
}: {
  title: string;
  rows: DueItem[];
  loading: boolean;
  testId: string;
  tone: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tone}`} /> {title}
        </h2>
        <Link
          href="/dues"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Sab dekhein
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {loading ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            Loading...
          </li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            Aaj koi nahi
          </li>
        ) : (
          rows.map((r) => {
            const content = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {r.partyName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.daysOverdue > 0
                      ? `${r.daysOverdue} din late`
                      : "Aaj due"}
                    {r.reference ? ` · ${r.reference}` : ""}
                  </p>
                </div>
                <span className={`text-sm font-bold ${tone}`}>
                  {formatRs(r.amountOpen)}
                </span>
              </>
            );
            const cls =
              "flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors";
            return (
              <li
                key={`${r.entityType}-${r.entityId}`}
                data-testid={testId}
              >
                {r.link ? (
                  <Link href={r.link} className={cls}>
                    {content}
                  </Link>
                ) : (
                  <div className={cls}>{content}</div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export default function DuesTodayWidget() {
  const { activeBranchId } = useAuth();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission("read:dues");
  const [receivable, setReceivable] = useState<DueItem[]>([]);
  const [payable, setPayable] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    Promise.all([
      fetchDues({ direction: "receivable", sort: "due" }, activeBranchId),
      fetchDues({ direction: "payable", sort: "due" }, activeBranchId),
    ])
      .then(([r, p]) => {
        if (cancelled) return;
        setReceivable(pickToday(r));
        setPayable(pickToday(p));
      })
      .catch(() => {
        if (cancelled) return;
        setReceivable([]);
        setPayable([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, activeBranchId]);

  if (!canRead) return null;

  return (
    <div
      data-testid="dues-today-widget"
      className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
    >
      <Column
        title="Aaj wasooli"
        rows={receivable}
        loading={loading}
        testId="dues-today-row"
        tone="text-emerald-600"
        Icon={ArrowDownLeft}
      />
      <Column
        title="Aaj dena hai"
        rows={payable}
        loading={loading}
        testId="dues-pay-today-row"
        tone="text-rose-600"
        Icon={ArrowUpRight}
      />
    </div>
  );
}
