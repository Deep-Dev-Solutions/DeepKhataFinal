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
  LayoutGrid,
  HandCoins,
  ScanSearch,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { AGENCY_APP_URL } from "@/lib/auth";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const navGroups = [
  {
    title: "Daily Operations",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Point of Sale", href: "/orders", icon: ShoppingCart },
      { name: "Galla / Cash Counter", href: "/cash", icon: Banknote },
    ],
  },
  {
    title: "Stock & Catalog",
    items: [
      { name: "Stock Finder", href: "/stock-finder", icon: ScanSearch },
      { name: "Products", href: "/products", icon: Package },
      { name: "Restock Hub", href: "/inventory/restock", icon: Warehouse },
      { name: "Categories", href: "/settings/categories", icon: Tags },
      { name: "Cabinets", href: "/settings/cabinets", icon: LayoutGrid },
    ],
  },
  {
    title: "Accounts",
    items: [
      { name: "Lena / Dena", href: "/dues", icon: HandCoins },
      { name: "Customers (Udhar)", href: "/customers", icon: Users },
      { name: "Vendors", href: "/vendors", icon: Truck },
    ],
  },
  {
    title: "Management (Owner Only)",
    adminOnly: true,
    items: [
      { name: "Reports", href: "/reports", icon: BarChart3 },
      { name: "Store Settings", href: "/settings", icon: Settings },
    ],
  },
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
      data-testid="sidebar-root"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
      className={`hidden md:flex flex-col ${
        isCollapsed ? "w-16" : "w-56"
      } bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-20 print:hidden transition-[width] duration-300 ease-in-out overflow-hidden`}
    >
      {/* Brand Logo & Collapse Toggle */}
      <div
        className={`h-14 flex items-center ${
          isCollapsed ? "justify-center px-2" : "justify-between px-5"
        } border-b border-gray-200 shrink-0 transition-all`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="bg-brand-600 p-1.5 rounded-lg shadow-sm shadow-brand-200 shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight text-gray-900 truncate">
              DeepKhata
            </span>
          )}
        </div>

        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer ${
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Links - Scrollable */}
      <nav
        style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
        className={`sidebar-scroll overflow-y-auto min-h-0 flex-1 ${
          isCollapsed ? "px-2 py-3 space-y-3" : "px-3 py-3 pb-6 space-y-3"
        }`}
      >
        {navGroups.map((group) => {
          if (group.adminOnly && user?.role === "STAFF") {
            return null;
          }

          const visibleItems = group.items.filter((item) => {
            if (item.name === "Reports" && !hasPermission("read:reports")) {
              return false;
            }
            if (item.name === "Lena / Dena" && !hasPermission("read:dues")) {
              return false;
            }
            if (item.name === "Store Settings" && user?.role === "STAFF") {
              return false;
            }
            return true;
          });

          if (visibleItems.length === 0) {
            return null;
          }

          return (
            <div key={group.title} className="pt-3 first:pt-0">
              {!isCollapsed && (
                <div className="mb-1.5 px-3">
                  <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
                    {group.title}
                  </span>
                </div>
              )}

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    (item.href === "/settings" && pathname === "/settings") ||
                    (item.href !== "/settings" &&
                      (pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      data-testid={`nav-${item.href.split("/").filter(Boolean).pop()}`}
                      title={item.name}
                      className={`flex ${
                        isCollapsed
                          ? "flex-col items-center justify-center py-2 px-1 text-center"
                          : "items-center gap-3 px-3 py-2"
                      } rounded-md text-sm font-medium transition-all group ${
                        isActive
                          ? "bg-brand-50 text-brand-700 shadow-sm border border-brand-100/50"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? "text-brand-700"
                            : "text-gray-400 group-hover:text-gray-600"
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
          );
        })}
      </nav>

      {/* Pinned Compact User Card with Logout */}
      <div
        style={{ flexShrink: 0 }}
        className={`${
          isCollapsed ? "p-2" : "p-2.5"
        } border-t border-gray-200 bg-gray-50/95 shrink-0 mt-auto shadow-xs`}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Link
              href="/settings?tab=profile"
              className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0 border border-brand-200 hover:ring-2 hover:ring-brand-400 hover:scale-105 transition-all cursor-pointer"
              title={`${user?.name || "User"} (${(user?.role || "OWNER").toUpperCase()}) - View Profile`}
            >
              {initials || "U"}
            </Link>
            <button
              onClick={handleLogout}
              data-testid="sidebar-logout"
              className="p-2 text-gray-400 hover:text-danger hover:bg-danger-bg rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 p-2.5 rounded-xl shadow-xs space-y-2">
            {/* User row + Prominent Logout button */}
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/settings?tab=profile"
                className="flex items-center gap-2 min-w-0 p-1 -m-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group flex-1"
                title="View Profile Settings"
              >
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0 border border-brand-200 group-hover:border-brand-400 group-hover:scale-105 transition-all">
                  {initials || "U"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-gray-900 truncate leading-tight group-hover:text-brand-600 transition-colors">
                    {user?.name || "User"}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate leading-tight">
                    {user?.email || ""}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 ml-auto text-gray-300 group-hover:text-brand-500 group-hover:trangray-x-0.5 transition-all shrink-0" />
              </Link>

              <button
                onClick={handleLogout}
                data-testid="sidebar-logout"
                className="flex items-center gap-1 px-2.5 py-1 text-gray-600 hover:text-danger hover:bg-danger-bg rounded-lg transition-colors cursor-pointer text-xs font-semibold shrink-0 border border-gray-200"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5 text-danger" />
                <span>Logout</span>
              </button>
            </div>

            {/* Role & Super Admin Link */}
            <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 text-[10px]">
              <Link
                href="/settings?tab=profile"
                className="flex items-center gap-1 text-gray-500 hover:text-brand-600 font-medium transition-colors cursor-pointer"
                title="View Profile Settings"
              >
                <ShieldCheck className="w-3 h-3 text-gray-400" />
                <span>{(user?.role || "OWNER").toUpperCase()}</span>
              </Link>
              {user?.role === "SUPER_ADMIN" && (
                <Link
                  href={AGENCY_APP_URL}
                  className="font-semibold text-brand-600 hover:text-brand-800"
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
