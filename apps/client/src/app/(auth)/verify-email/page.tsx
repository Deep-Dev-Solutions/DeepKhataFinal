"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { API_BASE_URL, apiFetch } from "@/lib/auth";
import AuthCard from "@/components/auth/AuthCard";
import TurnstileWidget, { useTurnstile } from "@/components/auth/TurnstileWidget";

type Status = "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [message, setMessage] = useState(
    token ? "" : "This verification link is missing its token.",
  );
  const [resendNote, setResendNote] = useState("");
  const [resending, setResending] = useState(false);
  const captcha = useTurnstile();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authClient
      .verifyEmail({ query: { token } })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          setMessage(
            error.message || "This verification link is invalid or has expired.",
          );
        } else {
          setStatus("success");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("Could not reach the server. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend() {
    if (captcha.enabled && !captcha.token) {
      setResendNote("Please complete the captcha check first.");
      return;
    }
    setResending(true);
    setResendNote("");
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: "POST",
        headers: captcha.headers,
      });
      if (res.ok) {
        setResendNote("A new verification email has been sent.");
      } else if (res.status === 401) {
        setResendNote("Sign in first, then request a new verification email.");
      } else {
        const data = await res.json().catch(() => null);
        setResendNote(data?.message || "Could not send the email right now.");
      }
    } catch {
      setResendNote("Could not reach the server.");
    } finally {
      setResending(false);
      captcha.reset();
    }
  }

  return (
    <AuthCard title="Verify your email">
      <div
        data-testid="verify-status"
        data-status={status}
        className={`p-4 rounded-xl border text-sm ${
          status === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : status === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-slate-50 border-slate-200 text-slate-600"
        }`}
      >
        {status === "verifying" && "Verifying your email..."}
        {status === "success" && "Your email is verified. Thank you!"}
        {status === "error" && message}
      </div>

      {status === "error" && (
        <div className="mt-4 space-y-3">
          <TurnstileWidget
            onToken={captcha.setToken}
            resetKey={captcha.resetKey}
          />
          <button
            type="button"
            data-testid="verify-resend"
            onClick={resend}
            disabled={resending}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {resending ? "Sending..." : "Resend verification email"}
          </button>
          {resendNote && (
            <p data-testid="verify-resend-note" className="mt-2 text-xs text-slate-600">
              {resendNote}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <Link
          href={status === "success" ? "/dashboard" : "/login"}
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          {status === "success" ? "Go to dashboard" : "Back to sign in"}
        </Link>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
