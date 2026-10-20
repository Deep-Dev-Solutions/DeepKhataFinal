import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { searchClient } from "@/lib/search/search-client";
import { offlineDb } from "@/lib/db";

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
    credentials: "include",
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

export async function findStock(
  q: string,
  branchId: string | null | undefined,
  limit = 20,
): Promise<StockFindResponse> {
  const isOnline = typeof navigator === "undefined" || navigator.onLine;

  if (isOnline) {
    try {
      const qs = new URLSearchParams({ q, limit: String(limit) });
      return await request<StockFindResponse>(`/stock/find?${qs.toString()}`, branchId);
    } catch (err) {
      console.warn("Online stock finder failed, falling back to local search:", err);
    }
  }

  const t0 = performance.now();
  const products = await searchClient.searchProducts(q, { limit });
  const results: StockResult[] = await Promise.all(
    products.map(async (p) => {
      const instances = await offlineDb.instances
        .where("productId")
        .equals(p.id)
        .toArray();
      const summaries = await offlineDb.stockSummary
        .where("productId")
        .equals(p.id)
        .toArray();

      const ownInstances = instances.filter((i) => !branchId || i.branchId === branchId);
      const availableOwn = ownInstances.filter((i) => i.status === "AVAILABLE").length;
      const otherAvailable = summaries.reduce((acc, s) => acc + s.available, 0);

      return {
        productId: p.id,
        name: p.name,
        sku: p.sku ?? null,
        partNumber: p.partNumber ?? null,
        aliases: [],
        compatibleWith: [],
        salePrice: p.price,
        minSalePrice: null,
        recentSoldPrices: [],
        photos: [],
        totalAvailable: availableOwn + otherAvailable,
        branches: [
          {
            branchId: branchId || "current",
            branchName: "Current Branch",
            isOwnBranch: true,
            available: availableOwn,
            byCondition: {},
            reserved: 0,
            inTransit: 0,
            locations: ownInstances.map((i) => ({
              instanceId: i.id,
              condition: (i.condition as StockCondition) || "WORKING",
              serialNumber: i.serialNumber ?? null,
              cabinetId: i.cabinetId ?? null,
              cabinetName: null,
              rack: null,
              shelf: null,
              bin: null,
              notes: null,
              photoUrl: null,
            })),
          },
        ],
      };
    }),
  );
  return { results, tookMs: Math.round(performance.now() - t0) };
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
