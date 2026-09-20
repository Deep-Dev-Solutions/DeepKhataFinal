"use client";

import { useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/dashboard/MobileNav";
import Header from "@/components/dashboard/Header";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { POSProvider, usePOS } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const { isCheckoutOpen } = usePOS();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* 1. Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area with dynamic transition on padding */}
      <div
        className={`flex flex-col ${
          isCollapsed ? "md:pl-20" : "md:pl-64"
        } min-h-screen pb-16 md:pb-0 transition-[padding] duration-300 ease-in-out`}
      >
        {/* 2. Top Header */}
        {!isCheckoutOpen && <Header />}

        {/* 3. The Page Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 min-h-0 flex flex-col">
          {children}
        </main>
      </div>

      {/* 4. Mobile Bottom Nav */}
      {!isCheckoutOpen && <MobileNav />}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      logout();
    }
  }, [isLoading, isAuthenticated, logout]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-500">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading workspace...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <POSProvider>
        <DashboardContent>{children}</DashboardContent>
      </POSProvider>
    </SidebarProvider>
  );
}
