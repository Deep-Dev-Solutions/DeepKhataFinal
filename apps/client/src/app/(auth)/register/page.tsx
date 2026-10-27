"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, User, Phone, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL, apiFetch } from "@/lib/auth";
import TurnstileWidget, { useTurnstile } from "@/components/auth/TurnstileWidget";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function RegisterPageContent() {
  const router = useRouter();
  const { setSession } = useAuth();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") || "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const captcha = useTurnstile();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (captcha.enabled && !captcha.token) {
      setError("Please complete the captcha check first.");
      return;
    }
    setLoading(true);

    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...captcha.headers },
        body: JSON.stringify({
          name,
          email,
          password,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        throw new Error(msg || "Registration failed");
      }

      // Registration does not set the cookie; sign in to open the session.
      const loginRes = await apiFetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        throw new Error(
          loginData?.message || "Account created. Please sign in.",
        );
      }

      setSession(loginData?.user);
      setSuccess("Account created. Check your email to verify your address.");

      if (loginData?.user?.businessId) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      captcha.reset();
      setLoading(false);
    }
  }
  return (
    <AuthCard
      title="Create your account"
      subtitle="Join thousands of businesses managing their workflow"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="mb-1 block text-caption font-medium text-gray-700"
          >
            Full Name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="name"
              name="name"
              data-testid="register-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-9"
              placeholder="Ali Khan"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-caption font-medium text-gray-700"
          >
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              name="email"
              data-testid="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              readOnly={Boolean(invitedEmail)}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="you@example.com"
              disabled={Boolean(invitedEmail)}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="phone"
            className="mb-1 block text-caption font-medium text-gray-700"
          >
            Mobile number (optional)
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="phone"
              name="phone"
              data-testid="register-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pl-9"
              placeholder="03XX XXXXXXX"
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
              data-testid="register-password"
              minLength={8}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              placeholder="Create a strong password"
            />
          </div>
        </div>

        <TurnstileWidget
          onToken={captcha.setToken}
          resetKey={captcha.resetKey}
        />

        {error && (
          <p
            data-testid="register-error"
            className="rounded-md border border-danger/30 bg-danger-bg px-2.5 py-2 text-caption font-medium text-danger-fg"
          >
            {error}
          </p>
        )}

        {success && (
          <p className="rounded-md border border-success/30 bg-success-bg px-2.5 py-2 text-caption font-medium text-success-fg">
            {success}
          </p>
        )}

        <div className="flex items-start gap-2 pt-1">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            data-testid="terms-checkbox"
            required
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-brand-700"
          />
          <label htmlFor="terms" className="text-caption text-gray-600">
            I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-brand-700 underline hover:text-brand-800"
            >
              Terms of Service and Privacy Policy
            </Link>
            .
          </label>
        </div>

        <Button
          type="submit"
          data-testid="register-submit"
          loading={loading}
          className="w-full"
        >
          {loading ? "Creating..." : "Create Account"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <div className="mt-5 border-t border-border pt-4 text-center">
        <p className="text-body text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline"
          >
            Sign in instead
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-gray-50" />}
    >
      <RegisterPageContent />
    </Suspense>
  );
}
