"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { CLIENT_APP_URL, API_BASE_URL, apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AgencyLoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [backendStatus, setBackendStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/health`, { method: "GET" });
        if (res.ok) {
          setBackendStatus("connected");
        } else {
          setBackendStatus("disconnected");
        }
      } catch {
        setBackendStatus("disconnected");
      }
    };
    checkBackend();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLockedOut(false);
    setLoading(true);

    try {
      const result = await api.post<{
        user?: { id?: string; name?: string; email?: string; role?: string };
      }>("/auth/agency-login", { email, password });

      // The API set the httpOnly session cookie; hydrate the auth context.
      setSession(result?.user);

      router.push("/");
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0;
      const errorMsg = err instanceof Error ? err.message : "Agency authentication failed";
      if (status === 429 || /lockout|locked/i.test(errorMsg)) {
        setIsLockedOut(true);
      }
      setError(errorMsg);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 font-sans sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="rounded-md bg-brand-700 p-2">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div className="leading-tight">
            <span className="block text-heading font-semibold tracking-tight text-gray-900">
              DeepKhata
            </span>
            <span className="block text-caption font-medium text-gray-500">
              Agency Master Control
            </span>
          </div>
        </div>
        <h2 className="mt-2 text-center text-heading font-semibold tracking-tight text-gray-900">
          Agency Portal
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-center text-body text-gray-500">
          Restricted administrative gateway for tenant provisioning and platform
          operations.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-lg border border-border bg-card px-4 py-6 shadow-sm sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="mb-1 block text-caption font-medium text-gray-700"
              >
                Super Admin Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="admin-email"
                  data-testid="agency-login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="admin@deepkhata.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="mb-1 block text-caption font-medium text-gray-700"
              >
                Master Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="admin-password"
                  data-testid="agency-login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {error && (
              <div
                data-testid="agency-login-error"
                className={`flex items-start gap-2 rounded-md border p-2.5 text-caption ${
                  isLockedOut
                    ? "border-danger/30 bg-danger-bg text-danger-fg"
                    : "border-warning/30 bg-warning-bg text-warning-fg"
                }`}
              >
                {isLockedOut ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="leading-relaxed">
                  <span className="mb-0.5 block font-semibold">
                    {isLockedOut
                      ? "Access Denied (Account/IP Locked)"
                      : "Authentication Failed"}
                  </span>
                  {error}
                </div>
              </div>
            )}

            <Button
              type="submit"
              data-testid="agency-login-submit"
              loading={loading}
              className="w-full"
            >
              {loading ? "Authenticating..." : "Access Agency Console"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-5 border-t border-border pt-4 text-center">
            <p className="text-caption text-gray-500">
              Looking for store or cashier login?{" "}
              <Link
                href={CLIENT_APP_URL}
                className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                Go to Merchant Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
