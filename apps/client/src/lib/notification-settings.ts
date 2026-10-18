import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type NotificationChannel = "IN_APP" | "EMAIL" | "WHATSAPP_LINK";

export type RuleKey =
  | "receivable.due_soon"
  | "receivable.due_today"
  | "receivable.overdue"
  | "payable.due_soon"
  | "payable.overdue"
  | "digest.daily"
  | "promise.broken"
  | "register.not_closed"
  | "stock.low";

export interface RuleConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  daysBefore?: number;
  offsetsDays?: number[];
  time?: string;
}

export type Recipients = "OWNER_ONLY" | "OWNER_AND_MANAGERS";

export interface NotificationSettings {
  rules: Record<RuleKey, RuleConfig>;
  digestTime: string;
  recipients: Recipients;
}

export interface NotificationSettingsUpdate {
  rules?: Partial<Record<RuleKey, Partial<RuleConfig>>>;
  digestTime?: string;
  recipients?: Recipients;
}

export const RULE_META: {
  key: RuleKey;
  label: string;
  setting?: "daysBefore" | "offsetsDays" | "time" | "digestTime";
}[] = [
  { key: "receivable.due_soon", label: "Wasooli — due date se pehle", setting: "daysBefore" },
  { key: "receivable.due_today", label: "Wasooli — aaj due" },
  { key: "receivable.overdue", label: "Wasooli overdue (repeat)", setting: "offsetsDays" },
  { key: "payable.due_soon", label: "Dena — due date se pehle", setting: "daysBefore" },
  { key: "payable.overdue", label: "Dena overdue", setting: "offsetsDays" },
  { key: "digest.daily", label: "Roz ka khulasa", setting: "digestTime" },
  { key: "promise.broken", label: "Wada toot gaya" },
  { key: "register.not_closed", label: "Galla band nahi hua", setting: "time" },
  { key: "stock.low", label: "Maal kam hai (low stock)" },
];

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parse "1, 3, 7" into sorted unique positive ints <= 365. Returns null when invalid. */
export function parseOffsets(text: string): number[] | null {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return null;
  const out = new Set<number>();
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 365) return null;
    out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

async function parseResponse(res: Response): Promise<NotificationSettings> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(msg || "Notification settings request failed");
  }
  return data as NotificationSettings;
}

export async function fetchNotificationSettings(
  activeBranchId?: string | null,
): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE_URL}/notification-settings`, {
    credentials: "include",
    headers: getAuthHeaders(activeBranchId),
  });
  return parseResponse(res);
}

export async function saveNotificationSettings(
  body: NotificationSettingsUpdate,
  activeBranchId?: string | null,
): Promise<NotificationSettings> {
  const res = await fetch(`${API_BASE_URL}/notification-settings`, {
    credentials: "include",
    method: "PUT",
    headers: getAuthHeaders(activeBranchId),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}
