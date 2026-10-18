import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export type StockCondition =
  | "ORIGINAL_PULL"
  | "COPY"
  | "MINOR_SCRATCHES"
  | "WORKING"
  | "DEAD_DONOR"
  | "DEFECTIVE";

export const CONDITIONS: StockCondition[] = [
  "ORIGINAL_PULL",
  "COPY",
  "MINOR_SCRATCHES",
  "WORKING",
  "DEAD_DONOR",
  "DEFECTIVE",
];

export const CONDITION_LABELS: Record<StockCondition, string> = {
  ORIGINAL_PULL: "Original Pull",
  COPY: "Copy",
  MINOR_SCRATCHES: "Minor Scratches",
  WORKING: "Working",
  DEAD_DONOR: "Dead Donor",
  DEFECTIVE: "Defective",
};

export interface StockLocation {
  instanceId: string;
  condition: StockCondition;
  serialNumber: string | null;
  cabinetId: string | null;
  cabinetName: string | null;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  notes: string | null;
  photoUrl: string | null;
}

export interface StockBranch {
  branchId: string;
  branchName: string;
  isOwnBranch: boolean;
  available: number;
  byCondition: Partial<Record<StockCondition, number>>;
  reserved: number;
  inTransit: number;
  locations?: StockLocation[];
}

export interface StockResult {
  productId: string;
  name: string;
  sku: string | null;
  partNumber: string | null;
  aliases: string[];
  compatibleWith: string[];
  salePrice: number;
  minSalePrice: number | null;
  costPrice?: number | null;
  recentSoldPrices: number[];
  photos: string[];
  totalAvailable: number;
  branches: StockBranch[];
}

export interface StockFindResponse {
  results: StockResult[];
  tookMs: number;
}

export interface ReservePayload {
  instanceId?: string;
  productId?: string;
  branchId?: string;
  condition?: StockCondition;
  customerName: string;
  customerPhone?: string;
  hours?: number;
}

export interface TransferPayload {
  fromBranchId: string;
  productId: string;
  quantity: number;
  condition?: StockCondition;
  note?: string;
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
      (data as { message?: string | string[] } | null)?.message ??
      (data as { error?: string } | null)?.error;
    throw new Error(
      Array.isArray(msg) ? msg.join(", ") : msg || "Request failed",
    );
  }
  return data as T;
}

export function findStock(
  q: string,
  branchId: string | null | undefined,
  limit = 20,
) {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return request<StockFindResponse>(`/stock/find?${qs.toString()}`, branchId);
}

export function createReservation(
  body: ReservePayload,
  branchId: string | null | undefined,
) {
  return request<unknown>("/reservations", branchId, { method: "POST", body });
}

export function createStockTransfer(
  body: TransferPayload,
  branchId: string | null | undefined,
) {
  return request<unknown>("/stock-transfers", branchId, {
    method: "POST",
    body,
  });
}

export const formatRs = (n: number) =>
  `Rs ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

/** "Original Pull ×2, Minor Scratches ×1" */
export function conditionSummary(
  byCondition: Partial<Record<StockCondition, number>>,
): string {
  return CONDITIONS.filter((c) => (byCondition[c] ?? 0) > 0)
    .map((c) => `${CONDITION_LABELS[c]} ×${byCondition[c]}`)
    .join(", ");
}

export function locationLabel(loc: StockLocation): string {
  const parts = [
    loc.cabinetName,
    loc.rack ? `Rack ${loc.rack}` : null,
    loc.shelf ? `Shelf ${loc.shelf}` : null,
    loc.bin ? `Bin ${loc.bin}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Location set nahi";
}

/** Own branch first, then others by availability. */
export function sortBranches(branches: StockBranch[]): StockBranch[] {
  return [...branches].sort((a, b) => {
    if (a.isOwnBranch !== b.isOwnBranch) return a.isOwnBranch ? -1 : 1;
    return b.available - a.available;
  });
}
