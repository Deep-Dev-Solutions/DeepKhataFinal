"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Store, User, Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState(""); // 🟢 Store fetched email
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [isCheckingToken, setIsCheckingToken] = useState(true); // 🟢 Loading state for initial fetch
  const [loading, setLoading] = useState(false); // Loading state for submit
  const [error, setError] = useState("");

  // 🟢 1. FETCH INVITATION DETAILS ON LOAD
  useEffect(() => {
    if (!token) {
      setError("No invitation token found in the link.");
      setIsCheckingToken(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        // Calling your new GET controller
        const res = await fetch(`${API_BASE_URL}/team/invite/${token}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.message || "Invalid or expired invitation link.",
          );
        }

        // Set the email from the database
        setEmail(data.email);
        setIsCheckingToken(false);
      } catch (err: any) {
        setError(err.message || "Failed to verify invitation.");
        setIsCheckingToken(false);
      }
    };

    fetchInvitation();
  }, [token]);

  // 🟢 2. HANDLE FORM SUBMISSION
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/team/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Failed to set up account.");

      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  // If we are currently checking the database for the token
  if (isCheckingToken) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Verifying invitation...</p>
      </div>
    );
  }

  // If the token was invalid/expired
  if (error && !email) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-center font-medium shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 🟢 NEW: DISABLED EMAIL INPUT */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Email Address
        </label>
        <div className="relative">
          <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="email"
            disabled
            value={email}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-200 bg-slate-50 text-slate-500 rounded-xl text-sm font-medium cursor-not-allowed"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Full Name
        </label>
        <div className="relative">
          <User className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder="e.g. Ali Raza"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Create Password
        </label>
        <div className="relative">
          <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder="••••••••"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600 font-medium text-center">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-70 shadow-sm"
      >
        {loading ? "Creating Account..." : "Join Workspace"}
        {!loading && <ArrowRight className="w-4 h-4" />}
      </button>
    </form>
  );
}

// MAIN PAGE COMPONENT
export default function JoinWorkspacePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-2 mb-6">
          <div className="bg-blue-600 p-2 rounded-xl shadow-sm">
            <Store className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            BizFlow
          </span>
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-slate-900">
          Accept Invitation
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Set up your account to join the workspace.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          <Suspense
            fallback={
              <div className="text-center text-slate-500 py-8">Loading...</div>
            }
          >
            <JoinForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
