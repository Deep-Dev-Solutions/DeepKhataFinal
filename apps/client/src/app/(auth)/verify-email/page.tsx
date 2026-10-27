"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { API_BASE_URL, apiFetch } from "@/lib/auth";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
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
        className={`rounded-md border p-3 text-body ${
          status === "success"
            ? "border-success/30 bg-success-bg text-success-fg"
            : status === "error"
              ? "border-danger/30 bg-danger-bg text-danger-fg"
              : "border-border bg-gray-50 text-gray-600"
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
          <Button
            type="button"
            data-testid="verify-resend"
            onClick={resend}
            loading={resending}
            className="w-full"
          >
            {resending ? "Sending..." : "Resend verification email"}
          </Button>
          {resendNote && (
            <p data-testid="verify-resend-note" className="mt-2 text-caption text-gray-600">
              {resendNote}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 text-center text-body">
        <Link
          href={status === "success" ? "/dashboard" : "/login"}
          className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          {status === "success" ? "Go to dashboard" : "Back to sign in"}
        </Link>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
