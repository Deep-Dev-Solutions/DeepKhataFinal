"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  PlusCircle,
} from "lucide-react";

const mobileNavItems = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "New", href: "/orders/new", icon: PlusCircle, isMain: true },
  { name: "Products", href: "/products", icon: Package },
  { name: "Customers", href: "/customers", icon: Users },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] print:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          if (item.isMain) {
            return (
              <Link
                key={item.name}
                href={item.href}
                className="flex flex-col items-center justify-center -mt-6"
              >
                <div className="bg-blue-600 text-white p-3 rounded-full shadow-lg shadow-blue-200 border-4 border-slate-50">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-medium text-slate-600 mt-1">
                  {item.name}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center justify-center w-16 py-1"
            >
              <Icon
                className={`w-5 h-5 mb-1 ${isActive ? "text-blue-600" : "text-slate-500"}`}
              />
              <span
                className={`text-[10px] font-medium ${isActive ? "text-blue-600" : "text-slate-500"}`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
