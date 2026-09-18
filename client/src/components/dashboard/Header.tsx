"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bell,
  Search,
  UserCircle,
  Package,
  AlertTriangle,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const mockNotifications = [
  {
    id: 1,
    title: "New Online Order",
    desc: "Zain Ahmed placed order #ORD-1046",
    time: "5m ago",
    type: "order",
    unread: true,
  },
  {
    id: 2,
    title: "Low Stock Alert",
    desc: "AirPods Pro (2nd Gen) is down to 3 units.",
    time: "2h ago",
    type: "alert",
    unread: true,
  },
  {
    id: 3,
    title: "Payment Received",
    desc: "Rs. 15,000 received from Waqas Ali.",
    time: "Yesterday",
    type: "payment",
    unread: false,
  },
];

export default function Header() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user, logout } = useAuth();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials =
    (user?.name || "User")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  const toggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsNotifOpen((prev) => !prev);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsNotifOpen(false);
      }
    }

    if (isNotifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotifOpen]);

  const unreadCount = mockNotifications.filter(
    (notification) => notification.unread,
  ).length;

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 px-4 sm:px-6 lg:px-8 flex items-center justify-between print:hidden">
      {/* Desktop Sidebar Toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="hidden md:flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors mr-2 cursor-pointer border border-slate-200/60 shadow-xs"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <PanelLeftOpen className="w-5 h-5 text-blue-600" />
        ) : (
          <PanelLeftClose className="w-5 h-5 text-slate-600" />
        )}
      </button>

      <div className="md:hidden font-bold text-lg text-slate-900 tracking-tight">
        DeepKhata
      </div>

      <div className="hidden md:flex flex-1 max-w-md ml-2">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search orders, customers..."
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={toggleNotifications}
            className={`p-2 relative rounded-full transition-colors ${isNotifOpen ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`}
          >
            <Bell className="w-5 h-5 pointer-events-none" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-[320px] sm:w-[380px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 z-50">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full">
                      {unreadCount} New
                    </span>
                  )}
                </h3>
                <button
                  type="button"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Mark all as read
                </button>
              </div>

              <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100">
                {mockNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer flex gap-4 ${notification.unread ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="shrink-0 mt-1">
                      {notification.type === "order" && (
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
                          <Package className="w-4 h-4" />
                        </div>
                      )}
                      {notification.type === "alert" && (
                        <div className="p-2 bg-rose-100 text-rose-600 rounded-full">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      )}
                      {notification.type === "payment" && (
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full">
                          <Wallet className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${notification.unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}
                        >
                          {notification.title}
                        </p>
                        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                          {notification.time}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {notification.desc}
                      </p>
                    </div>

                    {notification.unread && (
                      <div className="shrink-0 flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Quick Logout */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="hidden sm:flex flex-col text-right min-w-0">
            <span className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[120px]">
              {user?.name || "User"}
            </span>
            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 font-medium leading-tight">
              <ShieldCheck className="w-2.5 h-2.5 text-blue-600" />
              <span>{(user?.role || "OWNER").toUpperCase()}</span>
            </div>
          </div>

          <div
            className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200 shadow-2xs"
            title={`${user?.name || "User"} (${user?.email || ""})`}
          >
            {initials}
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200 cursor-pointer shadow-2xs"
            title="Log out of DeepKhata"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
