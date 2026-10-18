import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type TransferStatus =
  | "REQUESTED"
  | "DISPATCHED"
  | "RECEIVED"
  | "CANCELLED";

export interface TransferLine {
  productId: string;
  productName: string;
  condition: string;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  status: TransferStatus;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  requestedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  note: string | null;
  lines: TransferLine[];
}

export type TransferAction = "dispatch" | "receive" | "cancel";

async function request<T>(
  path: string,
  branchId: string | null | undefined,
  method = "GET",
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    method,
    headers: getAuthHeaders(branchId),
    cache: "no-store",
  });
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

export async function fetchTransfers(
  branchId?: string | null,
): Promise<StockTransfer[]> {
  const data = await request<{ items?: StockTransfer[] }>(
    "/stock-transfers?direction=all",
    branchId,
  );
  return data.items ?? [];
}

export function actOnTransfer(
  id: string,
  action: TransferAction,
  branchId?: string | null,
) {
  return request<StockTransfer>(
    `/stock-transfers/${encodeURIComponent(id)}/${action}`,
    branchId,
    "POST",
  );
}

/** Human readable age like "3 din" / "5 ghante" / "abhi". */
export function transferAge(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 60) return mins <= 1 ? "abhi" : `${mins} min pehle`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ghante pehle`;
  return `${Math.floor(hours / 24)} din pehle`;
}
