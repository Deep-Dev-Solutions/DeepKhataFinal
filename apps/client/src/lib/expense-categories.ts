import { Bike, Coffee, Package, Tag, Wrench, Zap } from "lucide-react";

/**
 * The petty-cash categories shared by the Galla page, the expense history page
 * and the CSV export. Ids are what the API stores; labels are what shopkeepers
 * read.
 */
export const EXPENSE_CATEGORIES = [
  {
    id: "CHAI_REFRESHMENT",
    label: "Chai / Tea",
    icon: Coffee,
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  {
    id: "DELIVERY_RIDER",
    label: "Delivery Rider",
    icon: Bike,
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    id: "REPAIR_PARTS",
    label: "Parts / Shop",
    icon: Wrench,
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  {
    id: "SUPPLIES",
    label: "Packaging",
    icon: Package,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    id: "UTILITIES",
    label: "Bills / Power",
    icon: Zap,
    color: "text-orange-700 bg-orange-50 border-orange-200",
  },
  {
    id: "OTHER",
    label: "Other Expense",
    icon: Tag,
    color: "text-slate-700 bg-slate-50 border-slate-200",
  },
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]["id"];

export function expenseCategoryMeta(id: string | null | undefined) {
  return EXPENSE_CATEGORIES.find((cat) => cat.id === id) ?? EXPENSE_CATEGORIES[5];
}
