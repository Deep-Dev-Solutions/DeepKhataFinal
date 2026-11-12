"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import DuesSummaryCards from "@/components/dues/DuesSummaryCards";
import DueRow from "@/components/dues/DueRow";
import { PageHeader } from "@/components/ui/page-header";
import DuePayModal from "@/components/dues/DuePayModal";
import DuePromiseModal from "@/components/dues/DuePromiseModal";
import {
  useDues,
  useDuesSummary,
  usePostPromise,
  usePostReminded,
  useRecordDuePayment,
} from "@/hooks/queries/useDues";
import {
  fetchWhatsappLink,
  karachiDateString,
  type DueBucket,
  type DueDirection,
  type DueItem,
  type DueSort,
} from "@/lib/dues";

const EMPTY_ITEMS: DueItem[] = [];

const BUCKETS: Array<DueBucket | "all"> = ["all", "0-7", "8-30", "31-90", "90+"];

function DuesPageContent() {
  const { activeBranchId } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");

  const [direction, setDirection] = useState<DueDirection>("receivable");
  const [bucket, setBucket] = useState<DueBucket | "all">("all");
  const [sort, setSort] = useState<DueSort>("oldest");
  const [branchOnly, setBranchOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");

  const [payItem, setPayItem] = useState<DueItem | null>(null);
  const [promiseItem, setPromiseItem] = useState<DueItem | null>(null);
  const [dismissedFocus, setDismissedFocus] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const summaryQuery = useDuesSummary();
  const listQuery = useDues({
    direction,
    bucket,
    q,
    sort,
    scope: branchOnly ? "branch" : "business",
  });
  const recordPayment = useRecordDuePayment();
  const promiseMutation = usePostPromise();
  const remindedMutation = usePostReminded();

  const summary = summaryQuery.data ?? null;
  const items = listQuery.data ?? EMPTY_ITEMS;
  const loading = listQuery.isPending;
  const listError = listQuery.error
    ? listQuery.error.message || "Failed to load dues"
    : "";
  const summaryError = summaryQuery.error
    ? summaryQuery.error.message || "Failed to load summary"
    : "";
  const error = listError || summaryError;

  // ?focus=<entityType>:<entityId> -> scroll to and highlight the row.
  useEffect(() => {
    if (!focus || loading || focusedRef.current === focus) return;
    const idx = focus.indexOf(":");
    if (idx < 0) return;
    const type = focus.slice(0, idx);
    const id = focus.slice(idx + 1);
    const match = items.find((i) => i.entityType === type && i.entityId === id);
    if (!match) return;
    focusedRef.current = focus;
    requestAnimationFrame(() => {
      document
        .querySelector(
          `[data-testid="dues-row"][data-entity-type="${type}"][data-entity-id="${CSS.escape(id)}"]`,
        )
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setDismissedFocus(focus), 4000);
  }, [focus, loading, items]);

  const handleWhatsapp = async (item: DueItem) => {
    try {
      const { url } = await fetchWhatsappLink(item, activeBranchId);
      window.open(url, "_blank");
      await remindedMutation.mutateAsync({ item, channel: "WHATSAPP_LINK" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "WhatsApp link failed");
    }
  };

  const handleCall = (item: DueItem) => {
    remindedMutation.mutateAsync({ item, channel: "CALL" }).catch(() => {});
  };

  const handleSnooze = async (item: DueItem) => {
    try {
      await promiseMutation.mutateAsync({
        item,
        body: { promisedDate: karachiDateString(3), kind: "SNOOZE" },
      });
      toast.success("3 din ke liye snooze kar diya");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Snooze failed");
    }
  };

  const submitPay = async (amount: number) => {
    if (!payItem) return;
    await recordPayment.mutateAsync({ item: payItem, amount });
    toast.success("Payment record ho gayi");
    setPayItem(null);
  };

  const submitPromise = async (promisedDate: string) => {
    if (!promiseItem) return;
    await promiseMutation.mutateAsync({
      item: promiseItem,
      body: { promisedDate, kind: "PROMISE" },
    });
    toast.success("Promise date save ho gayi");
    setPromiseItem(null);
  };

  const agingCounts = summary?.aging[direction];
  const tabCls = (active: boolean) =>
    `px-5 py-2 text-sm font-bold rounded-xl transition-colors ${
      active
        ? "bg-slate-900 text-white shadow-sm"
        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div
      data-testid="dues-page"
      className="mt-1 space-y-4 pb-10 animate-in fade-in duration-300"
    >
      <PageHeader
        title="Lena / Dena"
        subtitle="Customer udhar and vendor payables, across every branch or just this one."
      />

      <DuesSummaryCards summary={summary} />

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="dues-tab-lena"
          className={tabCls(direction === "receivable")}
          onClick={() => {
            setDirection("receivable");
            setBucket("all");
          }}
        >
          Lena{summary ? ` (${summary.counts.receivable})` : ""}
        </button>
        <button
          type="button"
          data-testid="dues-tab-dena"
          className={tabCls(direction === "payable")}
          onClick={() => {
            setDirection("payable");
            setBucket("all");
          }}
        >
          Dena{summary ? ` (${summary.counts.payable})` : ""}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const count =
            b === "all"
              ? undefined
              : agingCounts
                ? agingCounts[b]
                : undefined;
          const active = bucket === b;
          return (
            <button
              key={b}
              type="button"
              data-testid="dues-bucket-chip"
              data-bucket={b}
              onClick={() => setBucket(b)}
              className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
                active
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {b === "all" ? "All" : `${b} din`}
              {count !== undefined ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            data-testid="dues-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Naam ya phone se dhundein..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          />
        </div>
        <select
          data-testid="dues-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as DueSort)}
          className="px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 bg-white"
        >
          <option value="oldest">Oldest</option>
          <option value="amount">Amount</option>
          <option value="due">Due date</option>
        </select>
        <button
          type="button"
          data-testid="dues-branch-only"
          aria-pressed={branchOnly}
          onClick={() => setBranchOnly((prev) => !prev)}
          className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
            branchOnly
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          This branch only
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading...</p>
        ) : items.length === 0 && !error ? (
          <div
            data-testid="dues-empty"
            className="bg-white border border-dashed border-slate-300 rounded-2xl py-12 text-center text-sm text-slate-500"
          >
            {direction === "receivable"
              ? "Koi lena baqi nahi."
              : "Koi dena baqi nahi."}
          </div>
        ) : (
          items.map((item) => (
            <DueRow
              key={`${item.entityType}:${item.entityId}`}
              item={item}
              highlighted={
                focus === `${item.entityType}:${item.entityId}` &&
                dismissedFocus !== focus
              }
              onWhatsapp={handleWhatsapp}
              onCall={handleCall}
              onPay={setPayItem}
              onPromise={setPromiseItem}
              onSnooze={handleSnooze}
            />
          ))
        )}
      </div>

      {payItem && (
        <DuePayModal
          item={payItem}
          onClose={() => setPayItem(null)}
          onSubmit={submitPay}
        />
      )}
      {promiseItem && (
        <DuePromiseModal
          item={promiseItem}
          onClose={() => setPromiseItem(null)}
          onSubmit={submitPromise}
        />
      )}
    </div>
  );
}

export default function DuesPage() {
  return (
    <Suspense fallback={null}>
      <DuesPageContent />
    </Suspense>
  );
}
