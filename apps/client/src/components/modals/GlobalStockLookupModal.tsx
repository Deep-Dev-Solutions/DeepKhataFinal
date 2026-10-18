"use client";

import { useState } from "react";
import { Globe2, Loader2, Search, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

type GlobalStockRow = {
  branchName: string;
  productName: string;
  stock: number;
  price: number;
};

interface GlobalStockLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GlobalStockLookupModal({
  isOpen,
  onClose,
}: GlobalStockLookupModalProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GlobalStockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;

    setIsLoading(true);
    setHasSearched(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/product/global-stock?search=${encodeURIComponent(query)}`,
        { headers: getAuthHeaders(), cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to check branch stock");
      }
      setResults(Array.isArray(data) ? data : []);
    } catch (lookupError) {
      setResults([]);
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Failed to check branch stock",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-stock-lookup-title"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-5">
          <div>
            <h2
              id="global-stock-lookup-title"
              className="flex items-center gap-2 text-lg font-bold text-slate-900"
            >
              <Globe2 className="h-5 w-5 text-indigo-600" />
              Check Other Branches
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Search stock across every branch without changing your active branch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close branch stock lookup"
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 border-b border-slate-100 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product name..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !search.trim()}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        <div className="overflow-y-auto p-4">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : !hasSearched ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Search for a product to see branch availability.
            </p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No matching products found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Product</th>
                    <th className="px-4 py-3 font-bold">Branch</th>
                    <th className="px-4 py-3 text-right font-bold">Stock</th>
                    <th className="px-4 py-3 text-right font-bold">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((row, index) => (
                    <tr key={`${row.productName}-${row.branchName}-${index}`}>
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.productName}</td>
                      <td className="px-4 py-3 text-slate-600">{row.branchName}</td>
                      <td className={`px-4 py-3 text-right font-black ${row.stock > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {row.stock}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        Rs. {Number(row.price || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
