"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { API_BASE_URL, apiFetch, getAuthHeaders } from "@/lib/auth";

interface AccessLogEntry {
  createdAt: string;
  action: string;
  route: string;
  adminName: string;
}

/** Every time support looked at this shop's data, newest first. */
export default function AccessLogTab() {
  const [rows, setRows] = useState<AccessLogEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/settings/access-log?limit=50`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          if (!cancelled) setError("Could not load the access log.");
          return;
        }
        const data = (await res.json()) as AccessLogEntry[];
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="access-log-tab" className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Support access log</p>
          <p>
            Whenever our support team opens your account (always read-only), it
            is recorded here. See our{" "}
            <a href="/terms" target="_blank" className="text-emerald-700 underline">
              Terms and Privacy
            </a>
            .
          </p>
        </div>
      </div>

      {error && (
        <p data-testid="access-log-error" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!error && rows === null && (
        <p className="text-sm text-slate-500">Loading...</p>
      )}

      {rows && rows.length === 0 && (
        <p
          data-testid="access-log-empty"
          className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500"
        >
          No support access so far. If our team ever looks at your account, it
          will show up here.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Who</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={`${r.createdAt}-${i}`} data-testid="access-log-row">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">{r.adminName}</td>
                  <td className="px-4 py-2.5">{r.action}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                    {r.route}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
