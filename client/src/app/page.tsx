"use client";

import Link from "next/link";
import {
  ArrowRight,
  Store,
  Users,
  Smartphone,
  ReceiptText,
  TrendingUp,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* 🟢 NAVIGATION BAR */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Store className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              DeepKhata
            </span>
          </div>

          {/* Auth Links */}
          <div className="flex items-center gap-4">
            {!isLoading && isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 🟢 HERO SECTION */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
            The Complete Operating System <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              for Modern Businesses
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 mb-10">
            Stop managing orders on paper and scattered chats. DeepKhata brings
            your orders, payments, staff, and customers into one powerful,
            mobile-friendly platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {!isLoading && isAuthenticated ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto flex items-center justify-center gap-2 text-base font-semibold bg-blue-600 text-white px-8 py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                <LayoutDashboard className="w-5 h-5" />
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-base font-medium bg-blue-600 text-white px-8 py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                >
                  Start Your Business
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-base font-medium bg-white text-slate-700 border border-slate-200 px-8 py-3.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Sign In to Dashboard
                </Link>
              </>
            )}
          </div>
        </section>

        {/* 🟢 FEATURES GRID */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Everything you need to scale
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto">
                DeepKhata is designed to be simple enough for a single
                shopkeeper, yet powerful enough for a growing team.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Staff Management
                </h3>
                <p className="text-slate-600">
                  Add your employees, assign them roles, and track exactly who
                  created which order or received which payment.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-indigo-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <ReceiptText className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Smart Invoices
                </h3>
                <p className="text-slate-600">
                  Send professional, mobile-friendly digital invoices to your
                  customers instantly via shareable links.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-emerald-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Partial Payments
                </h3>
                <p className="text-slate-600">
                  Easily track full payments, advances, and pending balances
                  across Cash, Bank, and Online methods.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-orange-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <Smartphone className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Mobile First
                </h3>
                <p className="text-slate-600">
                  Run your entire business from your phone. Our responsive
                  dashboard feels like a native app on small screens.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-purple-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Real-time Analytics
                </h3>
                <p className="text-slate-600">
                  Know your daily revenue, top-selling products, and outstanding
                  customer balances at a glance.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                <div className="bg-rose-100 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <Store className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Multi-Tenancy
                </h3>
                <p className="text-slate-600">
                  Your data is completely isolated and secure. Your customers,
                  your orders, your business.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 🟢 BOTTOM CTA SECTION */}
        <section className="bg-slate-900 py-20 text-center px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to upgrade your business?
          </h2>
          <p className="text-slate-400 mb-10 max-w-xl mx-auto text-lg">
            Join forward-thinking business owners who use DeepKhata to scale
            their operations.
          </p>
          <Link
            href={!isLoading && isAuthenticated ? "/dashboard" : "/register"}
            className="inline-flex items-center justify-center gap-2 text-base font-medium bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-500 transition-colors shadow-lg"
          >
            {!isLoading && isAuthenticated
              ? "Go to Dashboard"
              : "Create Your Free Account"}
            <ArrowRight className="w-5 h-5" />
          </Link>
        </section>
      </main>

      {/* 🟢 FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between text-slate-500 text-sm">
          <p>© {new Date().getFullYear()} DeepKhata. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link href="#" className="hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-slate-900">
              Terms of Service
            </Link>
            <Link href="#" className="hover:text-slate-900">
              Contact Support
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
