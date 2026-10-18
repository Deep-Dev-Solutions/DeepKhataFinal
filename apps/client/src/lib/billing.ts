import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type PlanResource = "branches" | "users" | "products";

export interface PlanUsage {
  plan: { code: string; name: string };
  limits: {
    maxBranches: number | null;
    maxUsers: number | null;
    maxProducts: number | null;
  };
  usage: { branches: number; users: number; products: number };
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
}

export type ChecklistKey =
  | "first_product"
  | "first_sale"
  | "udhar_customer"
  | "staff_user"
  | "notification_prefs";

export interface Checklist {
  items: { key: ChecklistKey; done: boolean }[];
  completed: number;
  total: number;
  dismissed: boolean;
  sampleDataLoaded: boolean;
}

export interface PlanLimitBody {
  code: "PLAN_LIMIT_REACHED";
  resource: PlanResource;
  limit: number | null;
  used: number;
  plan: string;
  message: string;
}

export interface PublicInvoice {
  number: string;
  businessName: string;
  periodStart: string | null;
  periodEnd: string | null;
  lines: {
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    amount: number | string;
  }[];
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  status: string;
  dueDate: string | null;
  agency: {
    name: string;
    address?: string | null;
    ntn?: string | null;
    bank?: string | null;
    jazzcash?: string | null;
    easypaisa?: string | null;
  };
}

export const PLAN_LIMIT_EVENT = "plan-limit-reached";

/**
 * Call right after any fetch. If the API answered 403 PLAN_LIMIT_REACHED, the
 * upgrade dialog is opened (via the `plan-limit-reached` window event) and
 * `true` is returned. The response body stays readable (we clone it).
 */
export async function notifyIfPlanLimit(response: Response): Promise<boolean> {
  if (response.status !== 403 || typeof window === "undefined") return false;
  try {
    const body = (await response.clone().json()) as Partial<PlanLimitBody>;
    if (body?.code !== "PLAN_LIMIT_REACHED") return false;
    window.dispatchEvent(
      new CustomEvent<PlanLimitBody>(PLAN_LIMIT_EVENT, {
        detail: body as PlanLimitBody,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  branchId: string | null | undefined,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: getAuthHeaders(branchId),
    credentials: "include",
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  await notifyIfPlanLimit(response);
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const msg = (data as { message?: string | string[] } | null)?.message;
    throw new Error(
      Array.isArray(msg) ? msg.join(", ") : msg || "Request failed",
    );
  }
  return data as T;
}

export const fetchPlanUsage = (branchId?: string | null) =>
  request<PlanUsage>("/plans/usage", branchId);

export const fetchChecklist = (branchId?: string | null) =>
  request<Checklist>("/onboard/checklist", branchId);

export const dismissChecklist = (branchId?: string | null) =>
  request<unknown>("/onboard/checklist/dismiss", branchId, { method: "POST" });

export const wipeSampleData = (branchId?: string | null) =>
  request<unknown>("/onboard/sample-data/wipe", branchId, { method: "POST" });

/** Public (no login): the invoice token is the only credential. */
export async function fetchPublicInvoice(
  token: string,
): Promise<PublicInvoice | null> {
  const response = await fetch(
    `${API_BASE_URL}/public/invoices/${encodeURIComponent(token)}`,
    { credentials: "include" },
  );
  if (!response.ok) return null;
  return (await response.json()) as PublicInvoice;
}

export const publicInvoicePdfUrl = (token: string) =>
  `${API_BASE_URL}/public/invoices/${encodeURIComponent(token)}/pdf`;

/** wa.me link to the agency to ask for an upgrade. Null if not configured. */
export function upgradeWhatsappUrl(
  shopName: string | null | undefined,
  planName: string | null | undefined,
): string | null {
  const number = (process.env.NEXT_PUBLIC_AGENCY_WHATSAPP || "").replace(
    /\D/g,
    "",
  );
  if (!number) return null;
  const text = `Assalam o Alaikum, I want to upgrade ${shopName || "my shop"} from ${planName || "my current plan"}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Whole days from now until `iso` (min 0). Null if no date. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

export const RESOURCE_LABEL: Record<PlanResource, string> = {
  branches: "Branches",
  users: "Team members",
  products: "Products",
};
