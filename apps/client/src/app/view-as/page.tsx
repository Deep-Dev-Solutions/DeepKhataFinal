"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { API_BASE_URL, apiFetch } from "@/lib/auth";

/**
 * Public entry for the agency "view as tenant" link. Exchanges the one-hour
 * token for the (read-only) session cookie, then opens the dashboard.
 */
function ViewAsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(
    token ? null : "This view-as link is missing its token.",
  );
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/auth/view-as/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.message || "This view-as link is invalid or has expired.");
          return;
        }
        router.replace("/dashboard");
      } catch {
        setError("Could not reach the server.");
      }
    })();
  }, [token, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p
          data-testid="view-as-error"
          className="max-w-md rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
        >
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span data-testid="view-as-loading">Opening read-only view...</span>
    </div>
  );
}

export default function ViewAsPage() {
  return (
    <Suspense fallback={null}>
      <ViewAsInner />
    </Suspense>
  );
}
