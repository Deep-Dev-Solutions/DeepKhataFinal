"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { API_BASE_URL, apiFetch, clearAuthStorage } from "@/lib/auth";

interface SessionInfo {
  impersonated: boolean;
  impersonatedUntil?: string;
  businessName?: string | null;
}

/**
 * Fixed red banner shown while support is viewing this shop through a
 * read-only "view as tenant" session. Renders nothing for normal sessions.
 */
export default function ViewAsBanner() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/auth/session-info`);
        if (!res.ok) return;
        const data = (await res.json()) as SessionInfo;
        if (!cancelled && data.impersonated) setInfo(data);
      } catch {
        // Banner is informational; ignore network errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  async function exit() {
    setExiting(true);
    try {
      await apiFetch(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    } catch {
      // Cookie expires on its own within the hour.
    }
    clearAuthStorage();
    window.close();
    // window.close() is ignored for tabs not opened by script.
    window.location.assign("/login");
  }

  return (
    <div
      data-testid="view-as-banner"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow"
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span>Viewing as {info.businessName || "shop"} (read-only)</span>
      <button
        type="button"
        data-testid="view-as-exit"
        onClick={exit}
        disabled={exiting}
        className="rounded-md bg-white px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {exiting ? "Exiting..." : "Exit"}
      </button>
    </div>
  );
}
