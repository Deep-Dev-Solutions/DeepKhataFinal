import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type DueEntityType = "ORDER" | "VENDOR_PURCHASE" | "KHATA_ENTRY";
export type DueDirection = "receivable" | "payable";
export type DueBucket = "0-7" | "8-30" | "31-90" | "90+";
export type DueSort = "oldest" | "amount" | "due";

export interface AgingBuckets {
  "0-7": number;
  "8-30": number;
  "31-90": number;
  "90+": number;
}

export interface DuesSummary {
  toReceive: number;
  toPay: number;
  overdueToReceive: number;
  overdueToPay: number;
  dueThisWeekToReceive: number;
  dueThisWeekToPay: number;
  counts: { receivable: number; payable: number; overdueReceivable: number };
  aging: { receivable: AgingBuckets; payable: AgingBuckets };
}

export interface DueItem {
  entityType: DueEntityType;
  entityId: string;
  direction: DueDirection;
  partyType: string;
  partyId: string;
  partyName: string;
  partyPhone: string | null;
  amountOpen: number;
  originDate: string;
  dueDate: string | null;
  ageDays: number;
  daysOverdue: number;
  bucket: DueBucket;
  lastReminderAt: string | null;
  promiseDate: string | null;
  snoozedUntil: string | null;
  reference: string | null;
  link: string | null;
}

export interface DuesListParams {
  direction: DueDirection;
  bucket?: DueBucket | "all";
  q?: string;
  sort?: DueSort;
}

async function request<T>(
  path: string,
  branchId: string | null | undefined,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: getAuthHeaders(branchId),
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const msg =
      (data as { message?: string | string[]; error?: string } | null)?.message ??
      (data as { error?: string } | null)?.error;
    throw new Error(
      Array.isArray(msg) ? msg.join(", ") : msg || "Request failed",
    );
  }
  return data as T;
}

const entityPath = (type: DueEntityType, id: string) =>
  `/dues/${type}/${encodeURIComponent(id)}`;

export function fetchDuesSummary(branchId?: string | null) {
  return request<DuesSummary>("/dues/summary", branchId);
}

export async function fetchDues(
  params: DuesListParams,
  branchId?: string | null,
): Promise<DueItem[]> {
  const qs = new URLSearchParams({ direction: params.direction });
  if (params.bucket && params.bucket !== "all") qs.set("bucket", params.bucket);
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  const data = await request<{ items?: DueItem[] }>(
    `/dues?${qs.toString()}`,
    branchId,
  );
  return data.items ?? [];
}

export function postPromise(
  item: Pick<DueItem, "entityType" | "entityId">,
  body: { promisedDate: string; note?: string; kind?: "PROMISE" | "SNOOZE" },
  branchId?: string | null,
) {
  return request<unknown>(
    `${entityPath(item.entityType, item.entityId)}/promise`,
    branchId,
    { method: "POST", body },
  );
}

export function postReminded(
  item: Pick<DueItem, "entityType" | "entityId">,
  channel: "WHATSAPP_LINK" | "CALL",
  branchId?: string | null,
) {
  return request<unknown>(
    `${entityPath(item.entityType, item.entityId)}/reminded`,
    branchId,
    { method: "POST", body: { channel } },
  );
}

export function fetchWhatsappLink(
  item: Pick<DueItem, "entityType" | "entityId">,
  branchId?: string | null,
) {
  return request<{ url: string; phone: string; text: string }>(
    `${entityPath(item.entityType, item.entityId)}/whatsapp-link?lang=ur`,
    branchId,
  );
}

/** Record a payment against the underlying entity of a due row. */
export function recordDuePayment(
  item: DueItem,
  amount: number,
  branchId?: string | null,
) {
  switch (item.entityType) {
    case "KHATA_ENTRY":
      return request<unknown>(
        `/khata-entries/${encodeURIComponent(item.entityId)}/settle`,
        branchId,
        { method: "POST", body: { amount } },
      );
    case "ORDER":
      return request<unknown>("/order/recordpayment", branchId, {
        method: "POST",
        body: { orderId: item.entityId, amount, method: "CASH" },
      });
    case "VENDOR_PURCHASE":
      return request<unknown>(
        `/vendors/${encodeURIComponent(item.partyId)}/payment`,
        branchId,
        {
          method: "POST",
          body: {
            amount,
            description: item.reference
              ? `Payment for ${item.reference}`
              : "Payment",
          },
        },
      );
  }
}

/** YYYY-MM-DD in Asia/Karachi, offset by `plusDays`. */
export function karachiDateString(plusDays = 0): string {
  const base = new Date(Date.now() + plusDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

export function formatRs(n: number): string {
  return `Rs ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
}

export function reminderLabel(lastReminderAt: string | null): string {
  if (!lastReminderAt) return "—";
  const t = new Date(lastReminderAt).getTime();
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "Reminder: aaj";
  return `Reminder: ${days} din pehle`;
}
