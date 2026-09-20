"use client";

import React, { useState } from "react";
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
import { CLIENT_APP_URL } from "@/lib/auth";

export default function AgencyLoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLockedOut, setIsLockedOut] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLockedOut(false);
    setLoading(true);

    try {
      const result = await api.post<{
        accessToken?: string;
        user?: { id?: string; name?: string; email?: string; role?: string };
      }>("/auth/agency-login", { email, password });

      if (result?.accessToken) {
        setSession(result.accessToken, result.user);
      }

      router.push("/");
    } catch (err: any) {
      const status = err instanceof ApiError ? err.status : 0;
      const errorMsg = err?.message || "Agency authentication failed";
      if (status === 429 || /lockout|locked/i.test(errorMsg)) {
        setIsLockedOut(true);
      }
      setError(errorMsg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background glow accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Branding */}
        <div className="flex justify-center items-center gap-3 mb-6">
          <div className="h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-indigo-400/30">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <span className="text-2xl font-bold tracking-tight text-white block">
              DeepKhata
            </span>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest block -mt-1">
              Agency Master Control
            </span>
          </div>
        </div>

        <h2 className="text-center text-3xl font-extrabold text-white tracking-tight">
          Agency Portal
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400 max-w-sm mx-auto">
          Restricted administrative gateway for tenant provisioning and platform
          operations.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-800">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Super Admin Email
              </label>
              <div className="relative rounded-xl shadow-inner">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                  placeholder="admin@deepkhata.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Master Password
              </label>
              <div className="relative rounded-xl shadow-inner">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                  isLockedOut
                    ? "bg-rose-950/60 border-rose-600/50 text-rose-200"
                    : "bg-amber-950/50 border-amber-600/40 text-amber-200"
                }`}
              >
                {isLockedOut ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold block mb-0.5">
                    {isLockedOut
                      ? "Access Denied (Account/IP Locked)"
                      : "Authentication Failed"}
                  </span>
                  {error}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Authenticating..." : "Access Agency Console"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Navigation back to Merchant login */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400">
              Looking for store or cashier login?{" "}
              <Link
                href={CLIENT_APP_URL}
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
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
