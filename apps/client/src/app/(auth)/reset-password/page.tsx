"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new one.");
      return;
    }
    setLoading(true);
    try {
      const { error: apiError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (apiError) {
        setError(
          apiError.message ||
            "This reset link is invalid or expired. Request a new one.",
        );
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
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account.">
      {done ? (
        <div
          data-testid="reset-done"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
        >
          Password updated. All your other devices were signed out.{" "}
          <Link href="/login" className="font-semibold underline">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="reset-password"
              className="block text-sm font-medium text-slate-700"
            >
              New password
            </label>
            <input
              id="reset-password"
              data-testid="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full sm:text-sm border-slate-300 rounded-xl py-3 px-4 text-slate-900 focus:ring-blue-500 focus:border-blue-500 border outline-none"
              placeholder="At least 8 characters"
            />
          </div>
          {error && (
            <p data-testid="reset-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-testid="reset-submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Update password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
