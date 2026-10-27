"use client";

import React, { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";
import TurnstileWidget, { useTurnstile } from "@/components/auth/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const captcha = useTurnstile();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (captcha.enabled && !captcha.token) {
      setError("Please complete the captcha check first.");
      return;
    }
    setLoading(true);
    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
        fetchOptions: { headers: captcha.headers },
      });
      // Same answer whether or not the email exists (no account enumeration).
      if (apiError && apiError.status === 429) {
        setError("Too many requests. Please try again in a few minutes.");
      } else if (
        apiError &&
        (apiError.code === "CAPTCHA_REQUIRED" ||
          apiError.code === "CAPTCHA_INVALID")
      ) {
        setError("The captcha check failed. Please try again.");
        captcha.reset();
      } else {
        setDone(true);
      }
    } catch {
      setError("Could not reach the server. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Forgot password?"
      subtitle="Enter your account email and we will send a reset link."
    >
      {done ? (
        <div
          data-testid="forgot-done"
          className="rounded-md border border-success/30 bg-success-bg p-3 text-body text-success-fg"
        >
          If an account exists for that email, a reset link is on its way. The
          link works for 1 hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="mb-1 block text-caption font-medium text-gray-700"
            >
              Email address
            </label>
            <Input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <p className="mt-2 text-caption text-gray-500">
              Staff with a username login (no email): ask your shop owner to
              reset your password from Settings, Team.
            </p>
          </div>
          <TurnstileWidget
            onToken={captcha.setToken}
            resetKey={captcha.resetKey}
          />
          {error && (
            <p
              data-testid="forgot-error"
              className="rounded-md border border-danger/30 bg-danger-bg px-2.5 py-2 text-caption font-medium text-danger-fg"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            data-testid="forgot-submit"
            loading={loading}
            className="w-full"
          >
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
      <div className="mt-5 text-center text-body">
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
