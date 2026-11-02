"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SessionSwitchedNotice from "@/components/SessionSwitchedNotice";
import { CLIENT_APP_URL } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Tenants", testId: "nav-tenants" },
  { href: "/signups", label: "New Signups", testId: "nav-signups" },
  { href: "/billing", label: "Billing", testId: "nav-billing" },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, user, isAuthenticated, isLoading, sessionState } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/login";

  // A switched session is not a logged-out session: the admin cookie is usually
  // still recoverable (Exit view-as), so hold the page instead of bouncing to /login.
  const isSwitched = sessionState === "switched";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage && !isSwitched) {
      router.replace("/login");
    }
    if (isLoginPage && isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, isLoginPage, isSwitched, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isLoading || (!isAuthenticated && !isSwitched)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-brand-700" />
          <span className="text-body font-medium">Verifying agency session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-card border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700">
            <span className="text-body font-semibold text-white">DK</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-title font-semibold tracking-tight text-gray-900">
              DeepKhata Agency
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              <ShieldAlert className="w-3 h-3" />
              Master Control
            </span>
          </div>
          <nav className="flex items-center gap-1 ml-4">
            {NAV_LINKS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={item.testId}
                  className={`text-body font-medium px-3 py-1.5 rounded-lg transition-colors ${isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href={CLIENT_APP_URL}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Store Dashboard →
          </Link>
          {isSwitched ? (
            <div className="text-body" data-testid="app-shell-identity-paused">
              <span className="text-gray-500">Console paused</span>
              <Badge variant="neutral" uppercase className="ml-1.5">
                NOT SUPER_ADMIN
              </Badge>
            </div>
          ) : (
            <div className="text-body">
              <span className="text-gray-500">Logged in as </span>
              <span className="font-semibold text-gray-900">
                {user?.name || "Super Admin"}
              </span>
              <Badge variant="neutral" uppercase className="ml-1.5">
                {user?.role || "SUPER_ADMIN"}
              </Badge>
            </div>
          )}
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-body font-medium text-gray-600 hover:text-danger transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {children}
      </main>
      {isSwitched && <SessionSwitchedNotice />}
    </div>
  );
}