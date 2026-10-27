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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-gray-200 pb-safe z-50 shadow-overlay print:hidden">
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
                <div className="bg-brand-600 text-white p-3 rounded-full shadow-sm border-4 border-gray-50">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-caption font-medium text-gray-600 mt-1">
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
                className={`w-5 h-5 mb-1 ${isActive ? "text-brand-600" : "text-gray-500"}`}
              />
              <span
                className={`text-caption font-medium ${isActive ? "text-brand-600" : "text-gray-500"}`}
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
