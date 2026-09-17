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
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebar } from "@/context/SidebarContext";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
  { name: "Inventory", href: "/inventory/restock", icon: Warehouse },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Cash Hub", href: "/cash", icon: Banknote },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    role?: string;
  } | null>(null);

  useEffect(() => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return;

    try {
      setUser(JSON.parse(rawUser));
    } catch {
      setUser(null);
    }
  }, []);

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
    const token = localStorage.getItem("accessToken");

    try {
      await fetch("http://localhost:5000/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // Clear local state even if the network request fails.
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      router.push("/login");
    }
  };

  return (
    <aside
      className={`hidden md:flex flex-col ${
        isCollapsed ? "w-20" : "w-64"
      } bg-white border-r border-slate-200 min-h-screen fixed left-0 top-0 z-20 print:hidden transition-[width] duration-300 ease-in-out`}
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

      {/* 🟢 Navigation Links */}
      <nav
        className={`flex-1 ${
          isCollapsed ? "px-2 py-3 space-y-2" : "px-4 py-6 space-y-1.5"
        } overflow-y-auto`}
      >
        {navItems.map((item) => {
          if (item.name === "Reports" && !hasPermission("read:reports")) {
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
      </nav>

      {/* 🟢 THE EXPANDED / COMPACT USER CARD */}
      <div
        className={`${
          isCollapsed ? "p-2" : "p-4"
        } border-t border-slate-200 bg-slate-50/50 transition-all`}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <div
              className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200"
              title={`${user?.name || "Ali Khan"} (${(user?.role || "OWNER").toUpperCase()})`}
            >
              {initials || "AK"}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
            {/* User Info */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
                {initials || "AK"}
              </div>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {user?.name || "Ali Khan"}
                </span>
                <span className="text-[11px] font-medium text-slate-500 truncate">
                  {user?.email || "ali@alfatah.pk"}
                </span>
              </div>
            </div>

            {/* Role & Logout Row */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                <ShieldCheck className="w-3 h-3" />
                <span className="text-[10px] font-bold tracking-wider">
                  {(user?.role || "OWNER").toUpperCase()}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
