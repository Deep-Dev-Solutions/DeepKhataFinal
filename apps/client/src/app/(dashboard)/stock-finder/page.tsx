"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePermissions } from "@/hooks/usePermissions";
import StockResultCard from "@/components/stock-finder/StockResultCard";
import ReserveModal from "@/components/stock-finder/ReserveModal";
import TransferModal from "@/components/stock-finder/TransferModal";
import CustomerView from "@/components/stock-finder/CustomerView";
import {
  createReservation,
  createStockTransfer,
  findStock,
  type ReservePayload,
  type StockResult,
  type TransferPayload,
} from "@/lib/stock-finder";

function StockFinderContent() {
  const { activeBranchId } = useAuth();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";

  const [input, setInput] = useState(urlQ);
  const [q, setQ] = useState(urlQ.trim());
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  const [results, setResults] = useState<StockResult[]>([]);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const [reserveFor, setReserveFor] = useState<StockResult | null>(null);
  const [transferFor, setTransferFor] = useState<StockResult | null>(null);
  const [customerFor, setCustomerFor] = useState<StockResult | null>(null);

  // Sync when the URL ?q= changes (e.g. header palette link).
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setInput(urlQ);
    setQ(urlQ.trim());
  }

  const key = `${activeBranchId ?? ""}|${q}|${tick}`;
  const loading = !!q && loadedKey !== key;

  useEffect(() => {
    const h = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(h);
  }, [input]);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    findStock(q, activeBranchId)
      .then((res) => {
        if (cancelled) return;
        setError("");
        setResults(res.results);
        setTookMs(res.tookMs);
        setLoadedKey(key);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
        setTookMs(null);
        setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [q, activeBranchId, key]);

  const shownResults = q ? results : [];

  const submitReserve = async (payload: ReservePayload) => {
    await createReservation(payload, activeBranchId);
    toast.success("Reserve ho gaya");
    setReserveFor(null);
    setTick((t) => t + 1);
  };

  const submitTransfer = async (payload: TransferPayload) => {
    await createStockTransfer(payload, activeBranchId);
    toast.success("Request bhej di");
    setTransferFor(null);
    setTick((t) => t + 1);
  };

  return (
    <div
      data-testid="stock-finder-page"
      className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto"
    >
      <h1 className="text-2xl font-black text-slate-900">Stock Finder</h1>

      <div className="space-y-1.5">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
          <input
            data-testid="stock-finder-search"
            type="search"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setQ(input.trim());
              }
            }}
            placeholder="Part, model ya part number likhein — ya scan karein"
            className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-300 rounded-2xl text-lg font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          />
        </div>
        {tookMs !== null && q && !loading && (
          <p data-testid="stock-finder-took" className="text-[11px] text-slate-400">
            {shownResults.length} nateeje · {tookMs} ms
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Dhundh rahe hain...</p>
      ) : q && shownResults.length === 0 && !error ? (
        <div
          data-testid="stock-empty"
          className="bg-white border border-dashed border-slate-300 rounded-2xl py-12 text-center text-sm text-slate-500"
        >
          Kuch nahi mila. Doosra naam ya part number try karein.
        </div>
      ) : (
        <div className="space-y-4">
          {shownResults.map((r) => (
            <StockResultCard
              key={r.productId}
              result={r}
              canReserve={hasPermission("manage:reservations")}
              canRequest={hasPermission("request:transfers")}
              onReserve={setReserveFor}
              onRequest={setTransferFor}
              onSell={(res) =>
                router.push(
                  `/orders/new?addProduct=${encodeURIComponent(res.productId)}`,
                )
              }
              onCustomerView={setCustomerFor}
            />
          ))}
        </div>
      )}

      {reserveFor && (
        <ReserveModal
          result={reserveFor}
          onClose={() => setReserveFor(null)}
          onSubmit={submitReserve}
        />
      )}
      {transferFor && (
        <TransferModal
          result={transferFor}
          onClose={() => setTransferFor(null)}
          onSubmit={submitTransfer}
        />
      )}
      {customerFor && (
        <CustomerView result={customerFor} onClose={() => setCustomerFor(null)} />
      )}
    </div>
  );
}

export default function StockFinderPage() {
  return (
    <Suspense fallback={null}>
      <StockFinderContent />
    </Suspense>
  );
}
