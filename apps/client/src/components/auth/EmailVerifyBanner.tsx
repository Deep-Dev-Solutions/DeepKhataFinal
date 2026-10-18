"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL, apiFetch } from "@/lib/auth";

/**
 * Shown to owners whose email is not verified yet (team creation is blocked
 * until then). Renders nothing for staff, verified owners, or unknown state.
 */
export default function EmailVerifyBanner() {
  const { user, role } = useAuth();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

  if (!user || role !== "OWNER" || user.emailVerified !== false) return null;

  async function resend() {
    setSending(true);
    setNote("");
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: "POST",
      });
      if (res.ok) {
        setNote(`Verification email sent to ${user?.email}.`);
      } else {
        const data = await res.json().catch(() => null);
        setNote(data?.message || "Could not send the email right now.");
      }
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      data-testid="email-verify-banner"
      className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
    >
      <MailWarning className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="flex-1 min-w-[200px]">
        Please verify your email ({user.email}) to add staff and keep your
        account recoverable.
      </span>
      {note && (
        <span data-testid="email-verify-note" className="text-xs text-amber-800">
          {note}
        </span>
      )}
      <button
        type="button"
        data-testid="email-verify-resend"
        onClick={resend}
        disabled={sending}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {sending ? "Sending..." : "Resend email"}
      </button>
    </div>
  );
}
