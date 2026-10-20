"use client";

import React, { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Same answer whether or not the email exists (no account enumeration).
      if (apiError && apiError.status === 429) {
        setError("Too many requests. Please try again in a few minutes.");
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
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
        >
          If an account exists for that email, a reset link is on its way. The
          link works for 1 hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-sm font-medium text-slate-700"
            >
              Email address
            </label>
            <input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full sm:text-sm border-slate-300 rounded-xl py-3 px-4 text-slate-900 focus:ring-blue-500 focus:border-blue-500 border outline-none"
              placeholder="you@example.com"
            />
            <p className="mt-2 text-xs text-slate-500">
              Staff with a username login (no email): ask your shop owner to
              reset your password from Settings, Team.
            </p>
          </div>
          {error && (
            <p data-testid="forgot-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-testid="forgot-submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
