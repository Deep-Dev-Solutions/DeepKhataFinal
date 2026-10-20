import Dexie, { type Table } from "dexie";
import { upgradeQueueItem } from "./sync/queue-logic";

export interface LocalProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  basePrice?: number;
  stock: number;
  minSalePrice?: number | null;
  partNumber?: string | null;
  branchId?: string | null;
  updatedAt?: string;
  category?: { name: string } | null;
  cabinet?: { id?: string; name?: string | null; location?: string | null } | null;
  instances?: Array<{
    id: string;
    status: string;
    cabinet?: { name?: string | null; location?: string | null } | null;
    branch?: { id: string; name?: string; deletedAt?: string | null } | null;
  }>;
  totalBusinessStock?: number;
  otherBranchesWithStock?: string[];
  hasDeletedBranchStock?: boolean;
}

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string;
  shopName?: string;
  address?: string;
  creditLimit?: number;
  isDefaulter?: boolean;
  updatedAt?: string;
}

/** Stock unit pulled from `GET /sync/pull?entity=instances` (active branch only). */
export interface LocalInstance {
  id: string;
  productId: string;
  branchId: string;
  cabinetId?: string | null;
  status: string;
  condition?: string | null;
  serialNumber?: string | null;
  updatedAt: string;
}

/** Available units of a product in a branch other than the active one. */
export interface LocalStockSummary {
  productId: string;
  branchId: string;
  condition: string;
  available: number;
}

export interface LocalVendor {
  id: string;
  name: string;
  businessName?: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  updatedAt: string;
}

export interface LocalCategory {
  id: string;
  name: string;
  branchId?: string | null;
  updatedAt?: string;
}

export interface LocalCabinet {
  id: string;
  name: string;
  branchId: string;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  location?: string | null;
  updatedAt?: string;
}

export interface LocalBranch {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
  updatedAt?: string;
}

/**
 * Sync bookkeeping. Keys: `cursor:<entity>:<branchId>` (opaque server cursor)
 * and `lastPullAt` (ISO time of the last completed push+pull cycle).
 */
export interface LocalMeta {
  key: string;
  value: unknown;
}

export type SyncQueueType =
  | "CREATE_ORDER"
  | "RECORD_PAYMENT"
  | "CREATE_KHATA_ENTRY"
  | "UPSERT_CUSTOMER"
  | "CREATE_EXPENSE";

export type SyncQueueStatus = "pending" | "syncing" | "failed" | "conflict";

export interface SyncQueueItem {
  id: string; // Client-generated UUID, also the server idempotency key
  type: SyncQueueType;
  payload: Record<string, unknown>;
  createdAt: string;
  status: SyncQueueStatus;
  error?: string;
  lastError?: string;
  /** Optional so older writers (POS) that do not set it still type-check; treated as 0. */
  attempts?: number;
  /** ISO time before which the engine will not retry this item. */
  nextAttemptAt?: string;
  /** ISO time the item was marked "syncing" (crash recovery after 2 minutes). */
  syncStartedAt?: string;
}

export class DeepKhataDexieDB extends Dexie {
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  instances!: Table<LocalInstance, string>;
  stockSummary!: Table<LocalStockSummary, [string, string, string]>;
  vendors!: Table<LocalVendor, string>;
  categories!: Table<LocalCategory, string>;
  cabinets!: Table<LocalCabinet, string>;
  branches!: Table<LocalBranch, string>;
  meta!: Table<LocalMeta, string>;

  constructor() {
    super("DeepKhataOfflineDB");
    this.version(1).stores({
      products: "id, name, sku",
      customers: "id, name, phone",
      syncQueue: "id, type, createdAt, status",
    });
    // v2: delta-synced cache tables + retry bookkeeping. Existing rows are kept;
    // queued items are never dropped, an interrupted "syncing" one goes back to "pending".
    this.version(2)
      .stores({
        products: "id, name, sku, partNumber, updatedAt, branchId",
        instances: "id, productId, branchId, status, updatedAt",
        stockSummary: "[productId+branchId+condition], productId, branchId",
        customers: "id, name, phone, updatedAt",
        vendors: "id, name, updatedAt",
        categories: "id, name",
        cabinets: "id, branchId",
        branches: "id",
        meta: "key",
        syncQueue: "id, type, createdAt, status, nextAttemptAt",
      })
      .upgrade((tx) =>
        tx
          .table("syncQueue")
          .toCollection()
          .modify((item: SyncQueueItem) => {
            Object.assign(item, upgradeQueueItem(item));
          }),
      );
  }
}

export const offlineDb = new DeepKhataDexieDB();
