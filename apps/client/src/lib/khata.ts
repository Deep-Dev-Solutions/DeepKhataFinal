import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type KhataDirection = "RECEIVABLE" | "PAYABLE";
export type KhataPartyType = "CUSTOMER" | "VENDOR" | "OTHER";

export interface CreateKhataEntryBody {
  direction: KhataDirection;
  partyType: KhataPartyType;
  customerId?: string;
  vendorId?: string;
  partyName?: string;
  partyPhone?: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  note?: string;
}

/** Karachi-local YYYY-MM-DD for today + `days`. */
export function karachiDatePlus(days: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });
  const today = fmt.format(new Date()); // YYYY-MM-DD
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export async function createKhataEntry(
  branchId: string | null,
  body: CreateKhataEntryBody,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/khata-entries`, {
    method: "POST",
    headers: getAuthHeaders(branchId),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = data?.message;
    throw new Error(
      (Array.isArray(msg) ? msg.join(", ") : msg) || "Failed to save entry",
    );
  }
  return data;
}
