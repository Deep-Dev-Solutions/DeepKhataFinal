"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import SignupRow from "./SignupRow";
import { FOLLOW_UP_STATUSES, Signup } from "./types";

export default function SignupsTable() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try {
      const q = qs.toString();
      setSignups(await api.get<Signup[]>(`/agency/signups${q ? `?${q}` : ""}`));
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load signups");
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run().catch(console.error);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div>
          <label className="block text-caption font-medium text-gray-500 mb-1">Status</label>
          <select
            value={status}
            data-testid="signups-filter-status"
            onChange={(e) => setStatus(e.target.value)}
            className="h-[var(--control-md)] rounded-md border border-input bg-white px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">All</option>
            {FOLLOW_UP_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-[var(--control-md)] rounded-md border border-input bg-white px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-[var(--control-md)] rounded-md border border-input bg-white px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-danger-bg text-danger border border-danger rounded-lg p-3 text-body font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading signups...
        </div>
      ) : (
        <div className="bg-card border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table data-testid="signups-table" className="w-full text-left text-body">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Signed up</th>
                  <th className="px-4 py-3">Trial</th>
                  <th className="px-4 py-3">Follow-up</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {signups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No signups match these filters.
                    </td>
                  </tr>
                ) : (
                  signups.map((s) => (
                    <SignupRow
                      key={s.businessId}
                      signup={s}
                      onSaved={(u) => setSignups((prev) => prev.map((p) => (p.businessId === u.businessId ? u : p)))}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
