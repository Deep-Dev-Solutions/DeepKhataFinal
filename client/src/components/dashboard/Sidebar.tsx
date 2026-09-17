"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
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
  Wrench,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Work Orders", href: "/work-orders", icon: Wrench },
  { name: "Cash Hub", href: "/cash", icon: Banknote },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();
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
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen fixed left-0 top-0 z-20 print:hidden">
      {/* 🟢 Brand Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 shrink-0">
        <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm shadow-blue-200">
          <Store className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900">
          DeepKhata
        </span>
      </div>

      {/* 🟢 Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "text-blue-700" : "text-slate-400"}`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* 🟢 THE EXPANDED USER INFORMATION CARD */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
          {/* User Info */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
              {initials || "AK"}
            </div>
            <div className="flex flex-col overflow-hidden">
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
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
