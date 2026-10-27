"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL, AGENCY_APP_URL, apiFetch } from "@/lib/auth";
import TurnstileWidget, { useTurnstile } from "@/components/auth/TurnstileWidget";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Staff usernames look like "ali@shop-slug" (no dot after the @); emails have a dotted domain.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLockedOut, setIsLockedOut] = useState(false);
  // The API asks for a captcha only after repeated failed sign-ins.
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const captcha = useTurnstile();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLockedOut(false);
    if (captchaNeeded && captcha.enabled && !captcha.token) {
      setError("Please complete the captcha check first.");
      return;
    }
    setLoading(true);

    try {
      const identifier = email.trim();
      const credentials = EMAIL_PATTERN.test(identifier)
        ? { email: identifier, password }
        : { username: identifier, password };
      const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...captcha.headers },
        body: JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "CAPTCHA_REQUIRED" || data?.code === "CAPTCHA_INVALID") {
          setCaptchaNeeded(true);
          captcha.reset();
        }
        const errorMsg = data?.message || "Login failed";
        if (
          res.status === 429 ||
          errorMsg.toLowerCase().includes("lockout") ||
          errorMsg.toLowerCase().includes("locked")
        ) {
          setIsLockedOut(true);
        }
        throw new Error(errorMsg);
      }

      // 1. The API set the httpOnly session cookie; hydrate the auth context
      setSession(data?.user);

      // 2. 🟢 SMART ROUTING LOGIC
      if (data?.user?.role === "SUPER_ADMIN") {
        window.location.href = AGENCY_APP_URL;
      } else if (data?.user?.businessId) {
        // Business exists -> Go to main app
        router.push("/dashboard");
      } else {
        // No business -> Force them to complete onboarding
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      if (captchaNeeded) captcha.reset();
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your dashboard to manage your business"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-caption font-medium text-gray-700"
          >
            Email or username
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              name="email"
              data-testid="login-email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              placeholder="you@example.com or ali@your-shop"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-caption font-medium text-gray-700"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              name="password"
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-border accent-brand-700"
            />
            <label
              htmlFor="remember-me"
              className="ml-2 block cursor-pointer text-body text-gray-600"
            >
              Remember me
            </label>
          </div>

          <Link
            href="/forgot-password"
            data-testid="login-forgot-link"
            className="text-body font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {captchaNeeded && (
          <TurnstileWidget
            onToken={captcha.setToken}
            resetKey={captcha.resetKey}
          />
        )}

        {error && (
          <div
            data-testid="login-error"
            className={`rounded-md border p-2.5 text-body font-medium ${
              isLockedOut
                ? "border-danger/30 bg-danger-bg text-danger-fg"
                : "border-warning/30 bg-warning-bg text-warning-fg"
            }`}
          >
            <p className="text-center">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          data-testid="login-submit"
          loading={loading}
          className="w-full"
        >
          {loading ? "Signing in..." : "Sign In"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <div className="mt-5 space-y-2 text-center">
        <p className="text-body text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline"
          >
            Start your free trial
          </Link>
        </p>
        <div>
          <Link
            href={`${AGENCY_APP_URL}/login`}
            className="text-caption text-gray-400 transition-colors hover:text-gray-600"
          >
            Agency Master Portal →
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
