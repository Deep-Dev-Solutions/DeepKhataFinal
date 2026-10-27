"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <AuthCard
      title="Set a new password"
      subtitle="Choose a new password for your account."
    >
      {done ? (
        <div
          data-testid="reset-done"
          className="rounded-md border border-success/30 bg-success-bg p-3 text-body text-success-fg"
        >
          Password updated. All your other devices were signed out.{" "}
          <Link href="/login" className="font-semibold underline">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="reset-password"
              className="mb-1 block text-caption font-medium text-gray-700"
            >
              New password
            </label>
            <Input
              id="reset-password"
              data-testid="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {error && (
            <p
              data-testid="reset-error"
              className="rounded-md border border-danger/30 bg-danger-bg px-2.5 py-2 text-caption font-medium text-danger-fg"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            data-testid="reset-submit"
            loading={loading}
            className="w-full"
          >
            {loading ? "Saving..." : "Update password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
