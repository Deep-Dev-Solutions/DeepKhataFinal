"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Bell,
  Search,
  Package,
  AlertTriangle,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Warehouse,
  Truck,
  BarChart3,
  Banknote,
  Tags,
  LayoutGrid,
  GitBranch,
  ChevronDown,
  Check,
  Building2,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useSidebar } from "@/context/SidebarContext";
import { usePOS } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";

type SearchEntry = {
  keywords: string[];
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const searchIndex: SearchEntry[] = [
  {
    keywords: ["galla", "rokarr", "cash", "register", "cash counter"],
    label: "Galla / Cash Counter",
    description: "Open & close register, cash expenses",
    href: "/cash",
    icon: Banknote,
  },
  {
    keywords: [
      "khata",
      "udhar",
      "wasooli",
      "baqaya",
      "customers",
      "accounts",
      "ledger",
      "udhaar",
    ],
    label: "Customers (Udhar)",
    description: "Customer accounts & khata",
    href: "/customers",
    icon: Users,
  },
  {
    keywords: [
      "parchi",
      "bill",
      "sauda",
      "pos",
      "point of sale",
      "new order",
      "invoice",
      "orders",
    ],
    label: "Unified POS",
    description: "Create a new parchi / bill",
    href: "/orders/new",
    icon: ShoppingCart,
  },
  {
    keywords: ["maal", "peti", "stock", "restock", "inventory", "restock hub"],
    label: "Restock Hub",
    description: "Stock, reorder & inventory",
    href: "/inventory/restock",
    icon: Warehouse,
  },
  {
    keywords: ["supplier", "wholesaler", "vendors", "suppliers"],
    label: "Vendors",
    description: "Suppliers & wholesalers",
    href: "/vendors",
    icon: Truck,
  },
  {
    keywords: ["nafa", "hisab", "profit", "reports", "analytics", "report"],
    label: "Reports & Analytics",
    description: "Profit & hisab reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    keywords: ["dashboard", "home", "overview"],
    label: "Dashboard",
    description: "Today's overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    keywords: ["products", "items", "catalog"],
    label: "Products",
    description: "Item catalog",
    href: "/products",
    icon: Package,
  },
  {
    keywords: ["categories", "category"],
    label: "Categories",
    description: "Product categories",
    href: "/settings/categories",
    icon: Tags,
  },
  {
    keywords: ["cabinets", "racks", "cabinet"],
    label: "Cabinets",
    description: "Cabinets & racks",
    href: "/settings/cabinets",
    icon: LayoutGrid,
  },
];

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
  const { isCheckoutOpen } = usePOS();
  const { branches, activeBranchId, setActiveBranch } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const hideGlobalSearch = pathname === "/orders/new";

  const safeBranches = Array.isArray(branches) ? branches : [];
  const activeBranch =
    safeBranches.find((b) => b.id === activeBranchId) || safeBranches[0];

  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return searchIndex.filter((entry) =>
      `${entry.label} ${entry.keywords.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const selectResult = (entry: SearchEntry) => {
    router.push(entry.href);
    setSearchQuery("");
    setIsSearchOpen(false);
    setActiveIndex(0);
    searchInputRef.current?.blur();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        Math.min(prev + 1, Math.max(searchResults.length - 1, 0)),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length > 0) {
        const entry =
          searchResults[Math.min(activeIndex, searchResults.length - 1)];
        setActiveIndex(0);
        selectResult(entry);
      }
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
    }
  };

  // `/` anywhere focuses the search / jump input
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (isCheckoutOpen || hideGlobalSearch) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable)
        return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleSlash);
    return () => document.removeEventListener("keydown", handleSlash);
  }, [isCheckoutOpen, hideGlobalSearch]);

  // Click outside closes the search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    if (isSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBranchOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsBranchOpen(false);
      }
    }

    if (isBranchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBranchOpen]);

  const unreadCount = mockNotifications.filter(
    (notification) => notification.unread,
  ).length;

  if (isCheckoutOpen) {
    return null;
  }

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

      {!hideGlobalSearch && (
        <div className="hidden md:flex flex-1 max-w-md ml-2">
          <div className="relative w-full" ref={searchRef}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search or jump (galla, khata, parchi...)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveIndex(0);
                setIsSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setIsSearchOpen(true)}
              className="block w-full pl-10 pr-14 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
            />
            {!searchQuery && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-md">
                  /
                </kbd>
              </div>
            )}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 z-50">
                <div className="p-1.5 max-h-[320px] overflow-y-auto">
                  {searchResults.map((entry, idx) => {
                    const Icon = entry.icon;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={`${entry.href}-${entry.label}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => selectResult(entry)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                          isActive ? "bg-blue-50" : ""
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            isActive
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-bold truncate ${
                              isActive ? "text-blue-900" : "text-slate-800"
                            }`}
                          >
                            {entry.label}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {entry.description}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider shrink-0">
                          {entry.href}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 ml-auto">
        {/* ── Branch Switcher / Indicator ─────────────────────────────── */}
        {safeBranches.length > 0 && (
          <div className="flex items-center" ref={branchDropdownRef}>
            {safeBranches.length === 1 ? (
              // Static badge for single-branch businesses
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                <span className="max-w-[140px] truncate">
                  {safeBranches[0].name}
                </span>
              </div>
            ) : (
              // Custom dropdown switcher for multi-branch businesses
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsBranchOpen((prev) => !prev)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border select-none ${
                    isBranchOpen
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-100"
                      : "bg-blue-50/80 hover:bg-blue-100 text-blue-700 border-blue-200 shadow-2xs hover:shadow-xs"
                  }`}
                  title="Click to switch active branch"
                  aria-expanded={isBranchOpen}
                  aria-haspopup="listbox"
                >
                  <GitBranch
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                      isBranchOpen ? "text-white" : "text-blue-600"
                    }`}
                  />
                  <span className="max-w-[120px] sm:max-w-[160px] truncate">
                    {activeBranch?.name || "Select Branch"}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                      isBranchOpen ? "rotate-180 text-white" : "text-blue-500"
                    }`}
                  />
                </button>

                {isBranchOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-[0_12px_36px_rgb(0,0,0,0.14)] border border-slate-200/90 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-50 p-1.5"
                    role="listbox"
                    aria-label="Branch selection"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between mb-1 bg-slate-50/60 rounded-t-xl">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Switch Location
                      </span>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {safeBranches.length} branches
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 p-0.5">
                      {safeBranches.map((b) => {
                        const isSelected = (activeBranchId ?? "") === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setActiveBranch(b.id);
                              setIsBranchOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-blue-50 text-blue-700 font-bold border border-blue-200/70 shadow-2xs"
                                : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-transparent"
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "bg-blue-600 text-white shadow-2xs"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {b.name}
                                </p>
                                {b.location ? (
                                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5 mt-0.5">
                                    <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                                    <span className="truncate">
                                      {b.location}
                                    </span>
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400 truncate">
                                    Physical Branch
                                  </p>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-blue-600 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-1 pt-1.5 border-t border-slate-100 px-1">
                      <Link
                        href="/settings?tab=branches"
                        onClick={() => setIsBranchOpen(false)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                      >
                        Manage Branches
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
      </div>
    </header>
  );
}
