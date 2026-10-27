export type BillingCycle = "MONTHLY" | "YEARLY";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID" | string;
export type PaymentMethod = "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CASH" | "OTHER";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

export interface InvoiceLine {
  description: string;
  quantity: number | string;
  unitPrice: string;
  amount: string;
}

export interface InvoicePayment {
  id: string;
  amount: string;
  method: PaymentMethod;
  reference?: string | null;
  proofUrl?: string | null;
  receivedAt?: string | null;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  number: string;
  businessId: string;
  businessName: string;
  planId: string | null;
  billingCycle: BillingCycle;
  periods: number;
  periodStart: string | null;
  periodEnd: string | null;
  lines: InvoiceLine[];
  subtotal: string;
  discount: string;
  total: string;
  status: InvoiceStatus;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  publicToken: string | null;
  publicUrl: string | null;
  createdAt: string;
  payments?: InvoicePayment[];
}

export interface TenantOption {
  id: string;
  name: string;
}

export const STATUS_BADGES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SENT: "bg-brand-50 text-brand-700 border-brand-200",
  PAID: "bg-success-bg text-success border-success",
  OVERDUE: "bg-danger-bg text-danger border-danger",
  VOID: "bg-gray-50 text-gray-400 border-gray-200 line-through",
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Display only; money stays a string end to end. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Rs. 0";
  const [int, frac] = String(value).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs. ${grouped}${frac && /[1-9]/.test(frac) ? "." + frac : ""}`;
}

export const MONEY_RE = /^\d+(\.\d{1,2})?$/;
