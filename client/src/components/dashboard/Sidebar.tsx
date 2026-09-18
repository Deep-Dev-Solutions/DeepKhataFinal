"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Settings,
  LogOut,
  ShieldCheck,
  BarChart3,
  Banknote,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  Truck,
  Tags,
  Database,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
  { name: "Vendors", href: "/vendors", icon: Truck },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Cash Register", href: "/cash", icon: Banknote },
  { name: "Inventory", href: "/inventory/restock", icon: Warehouse },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

const settingsItems = [
  { name: "Cabinets", href: "/settings/cabinets", icon: Warehouse },
  { name: "Categories", href: "/settings/categories", icon: Tags },
  { name: "Import Data", href: "/settings/import", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user, logout } = useAuth();

  const initials = useMemo(() => {
    const name = user?.name || "Ali Khan";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [user]);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <aside
      style={{ height: "100dvh", maxHeight: "100dvh" }}
      className={`hidden md:flex flex-col ${
        isCollapsed ? "w-20" : "w-64"
      } bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-20 print:hidden transition-[width] duration-300 ease-in-out overflow-hidden`}
    >
      {/* 🟢 Brand Logo & Collapse Toggle */}
      <div
        className={`h-16 flex items-center ${
          isCollapsed ? "justify-center px-2" : "justify-between px-5"
        } border-b border-slate-200 shrink-0 transition-all`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm shadow-blue-200 shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight text-slate-900 truncate">
              DeepKhata
            </span>
          )}
        </div>

        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ${
            isCollapsed ? "hidden" : "block"
          }`}
          title="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {isCollapsed && (
        <div className="px-2 pt-2 flex justify-center">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 🟢 Navigation Links - Scrollable */}
      <nav
        style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
        className={`sidebar-scroll overflow-y-auto min-h-0 flex-1 ${
          isCollapsed ? "px-2 py-3 space-y-2" : "px-3 py-3 pb-6 space-y-1"
        }`}
      >
        {navItems.map((item) => {
          if (
            item.name === "Reports" &&
            (user?.role === "STAFF" || !hasPermission("read:reports"))
          ) {
            return null;
          }
          if (item.name === "Settings" && user?.role === "STAFF") {
            return null;
          }

          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              className={`flex ${
                isCollapsed
                  ? "flex-col items-center justify-center py-2 px-1 text-center"
                  : "items-center gap-3 px-3 py-2.5"
              } rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive
                    ? "text-blue-700"
                    : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span
                className={`${
                  isCollapsed
                    ? "text-[10px] font-semibold mt-1 tracking-tight truncate max-w-full"
                    : "truncate"
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}

        {/* 🟢 Settings Group (Hidden for STAFF) */}
        {user?.role !== "STAFF" && (
          <div className={`pt-4 pb-2 ${isCollapsed ? "px-1" : "px-3"}`}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <Settings
                className={`w-4 h-4 text-slate-400 ${isCollapsed ? "mx-auto" : ""}`}
              />
              {!isCollapsed && (
                <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                  Settings
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {settingsItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={item.name}
                    className={`flex ${
                      isCollapsed
                        ? "flex-col items-center justify-center py-2 px-1 text-center"
                        : "items-center gap-3 px-3 py-2"
                    } rounded-xl text-sm font-medium transition-all group ${
                      isActive
                        ? "bg-slate-100 text-slate-900 shadow-sm border border-slate-200/50"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? "text-slate-700"
                          : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    />
                    <span
                      className={`${
                        isCollapsed
                          ? "text-[10px] font-semibold mt-1 tracking-tight truncate max-w-full"
                          : "truncate"
                      }`}
                    >
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* 🟢 Pinned Compact User Card with Logout */}
      <div
        style={{ flexShrink: 0 }}
        className={`${
          isCollapsed ? "p-2" : "p-2.5"
        } border-t border-slate-200 bg-slate-50/95 shrink-0 mt-auto shadow-xs`}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <div
              className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200"
              title={`${user?.name || "User"} (${(user?.role || "OWNER").toUpperCase()})`}
            >
              {initials || "U"}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs space-y-2">
            {/* User row + Prominent Logout button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200">
                  {initials || "U"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {user?.name || "User"}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate leading-tight">
                    {user?.email || ""}
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer text-xs font-semibold shrink-0 border border-slate-200"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                <span>Logout</span>
              </button>
            </div>

            {/* Role & Super Admin Link */}
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px]">
              <div className="flex items-center gap-1 text-slate-500 font-medium">
                <ShieldCheck className="w-3 h-3 text-slate-400" />
                <span>{(user?.role || "OWNER").toUpperCase()}</span>
              </div>
              {user?.role === "SUPER_ADMIN" && (
                <Link
                  href="/agency-admin"
                  className="font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Agency Portal →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
