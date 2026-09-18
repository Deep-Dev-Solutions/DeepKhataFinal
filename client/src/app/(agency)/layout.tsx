"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, user } = useAuth();
  const pathname = usePathname();

  // On the agency login page, don't show the dashboard header
  if (pathname === "/agency-admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-200">
            <span className="text-white font-bold text-sm">DK</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              DeepKhata Agency
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
              <ShieldAlert className="w-3 h-3" />
              Master Control
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg transition-colors"
          >
            Store Dashboard →
          </Link>
          <div className="text-sm">
            <span className="text-slate-500">Logged in as </span>
            <span className="font-semibold text-slate-900">
              {user?.name || "Super Admin"}
            </span>
            <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
              SUPER_ADMIN
            </span>
          </div>
          <button
            onClick={() => logout("/agency-admin/login")}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-rose-600 transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
