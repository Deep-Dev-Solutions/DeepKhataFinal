import Dexie, { type Table } from "dexie";

export interface LocalProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  stock: number;
  category?: { name: string } | null;
  instances?: Array<{
    id: string;
    condition: string;
    status: string;
    cabinet?: { name?: string | null; location?: string | null } | null;
  }>;
}

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string;
  shopName?: string;
  address?: string;
  creditLimit?: number;
  isDefaulter?: boolean;
}

export interface SyncQueueItem {
  id: string; // Client-generated UUID
  type: "CREATE_ORDER" | "UPDATE_ORDER_STATUS";
  payload: any;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  error?: string;
}

export class DeepKhataDexieDB extends Dexie {
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super("DeepKhataOfflineDB");
    this.version(1).stores({
      products: "id, name, sku",
      customers: "id, name, phone",
      syncQueue: "id, type, createdAt, status",
    });
  }
}

export const offlineDb = new DeepKhataDexieDB();
