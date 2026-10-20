import MiniSearch from "minisearch";
import { offlineDb, type LocalProduct, type LocalCustomer } from "@/lib/db";

const CACHE_STALE_MS = 10 * 60 * 1000; // 10 minutes

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
}

class SearchClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private reqSeq = 0;
  private lastWarmedAt: number = 0;
  private isWarming = false;

  // Fallback in-memory indices when Worker is unavailable (e.g. Node / SSR / jsdom / restricted web worker)
  private fallbackProductIndex: MiniSearch | null = null;
  private fallbackCustomerIndex: MiniSearch | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === "undefined" || typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("../../workers/search.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (e: MessageEvent) => {
        const { type, results, reqId } = e.data || {};
        if (reqId && this.pending.has(reqId)) {
          const req = this.pending.get(reqId)!;
          this.pending.delete(reqId);
          req.resolve(results);
        }
      };
      this.worker.onerror = (err) => {
        console.warn("Search worker error, falling back to in-memory MiniSearch:", err);
        this.worker = null;
      };
    } catch (err) {
      console.warn("Failed to spawn search worker, using in-memory fallback:", err);
      this.worker = null;
    }
  }

  private sendRequest<T>(type: string, data: any): Promise<T> {
    const reqId = `srch_${++this.reqSeq}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.worker!.postMessage({ type, data, reqId });
      // Safety timeout after 2 seconds
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          reject(new Error("Search worker timeout"));
        }
      }, 2000);
    });
  }

  /**
   * Warms the local MiniSearch index from Dexie tables.
   */
  async warm(): Promise<void> {
    if (typeof window === "undefined" || this.isWarming) return;
    this.isWarming = true;

    try {
      const [products, customers, instances, stockSummaries, branches] = await Promise.all([
        offlineDb.products.toArray(),
        offlineDb.customers.toArray(),
        offlineDb.instances.toArray(),
        offlineDb.stockSummary.toArray(),
        offlineDb.branches.toArray(),
      ]);

      const branchNameById = new Map<string, string>(
        branches.map((b: any) => [b.id, b.name])
      );

      const availableInstancesByProd = new Map<string, any[]>();
      for (const inst of instances) {
        if (inst.status === "AVAILABLE") {
          const list = availableInstancesByProd.get(inst.productId) || [];
          list.push(inst);
          availableInstancesByProd.set(inst.productId, list);
        }
      }

      const otherBranchesByProd = new Map<string, string[]>();
      for (const ss of stockSummaries) {
        if (ss.available > 0) {
          const bName = branchNameById.get(ss.branchId);
          if (bName) {
            const list = otherBranchesByProd.get(ss.productId) || [];
            if (!list.includes(bName)) list.push(bName);
            otherBranchesByProd.set(ss.productId, list);
          }
        }
      }

      const enrichedProducts = products.map((p) => {
        const localInsts = availableInstancesByProd.get(p.id) || [];
        const otherStock = otherBranchesByProd.get(p.id) || [];
        const instancesList =
          Array.isArray(p.instances) && p.instances.length > 0
            ? p.instances
            : localInsts;
        const localStock = localInsts.length;
        const totalStock = localStock > 0 ? localStock : (p.stock || 0);

        return {
          ...p,
          instances: instancesList,
          stock: totalStock,
          otherBranchesWithStock:
            p.otherBranchesWithStock && p.otherBranchesWithStock.length > 0
              ? p.otherBranchesWithStock
              : otherStock,
        };
      });

      if (this.worker) {
        await Promise.all([
          this.sendRequest("INDEX_PRODUCTS", enrichedProducts),
          this.sendRequest("INDEX_CUSTOMERS", customers),
        ]);
      } else {
        // In-memory fallback
        const pMs = new MiniSearch({
          fields: ["name", "sku", "partNumber", "categoryName", "aliases", "compatibleWith"],
          storeFields: [
            "id",
            "name",
            "sku",
            "partNumber",
            "price",
            "basePrice",
            "stock",
            "minSalePrice",
            "branchId",
            "category",
            "cabinet",
            "instances",
            "otherBranchesWithStock",
            "totalBusinessStock",
            "hasDeletedBranchStock",
          ],
          searchOptions: {
            boost: { name: 2, sku: 2, partNumber: 1.5 },
            fuzzy: 0.2,
            prefix: true,
          },
          extractField: (document: any, fieldName: string) => {
            if (fieldName === "categoryName") return document.category?.name || "";
            if (fieldName === "aliases") {
              return Array.isArray(document.aliases) ? document.aliases.join(" ") : "";
            }
            if (fieldName === "compatibleWith") {
              return Array.isArray(document.compatibleWith)
                ? document.compatibleWith.join(" ")
                : "";
            }
            return document[fieldName] ?? "";
          },
        });
        if (enrichedProducts.length > 0) pMs.addAll(enrichedProducts);
        this.fallbackProductIndex = pMs;

        const cMs = new MiniSearch({
          fields: ["name", "phone", "shopName", "address"],
          storeFields: [
            "id",
            "name",
            "phone",
            "shopName",
            "address",
            "creditLimit",
            "isDefaulter",
          ],
          searchOptions: {
            boost: { name: 2, phone: 2, shopName: 1.5 },
            fuzzy: 0.2,
            prefix: true,
          },
        });
        if (customers.length > 0) cMs.addAll(customers);
        this.fallbackCustomerIndex = cMs;
      }

      this.lastWarmedAt = Date.now();
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Checks whether the local cache has data and is fresh (< 10 min old).
   */
  async isCacheWarm(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (Date.now() - this.lastWarmedAt > CACHE_STALE_MS) {
      const count = await offlineDb.products.count();
      if (count > 0) {
        await this.warm();
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Fast fuzzy search products from local MiniSearch (< 100ms).
   */
  async searchProducts(
    query: string,
    options?: { category?: string; limit?: number }
  ): Promise<LocalProduct[]> {
    if (!query.trim()) return [];
    await this.isCacheWarm();

    if (this.worker) {
      try {
        const results = await this.sendRequest<any[]>("SEARCH_PRODUCTS", {
          query: query.trim(),
          category: options?.category,
          limit: options?.limit ?? 50,
        });
        return results as LocalProduct[];
      } catch {
        // Fallback below
      }
    }

    if (this.fallbackProductIndex) {
      let results = this.fallbackProductIndex.search(query.trim()) as any[];
      if (options?.category && options.category !== "All") {
        results = results.filter((r) => r.category?.name === options.category);
      }
      return results.slice(0, options?.limit ?? 50) as LocalProduct[];
    }

    // Direct Dexie fallback
    const q = query.toLowerCase();
    const rows = await offlineDb.products.toArray();
    return rows
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.partNumber && p.partNumber.toLowerCase().includes(q))
      )
      .slice(0, options?.limit ?? 50);
  }

  /**
   * Fast fuzzy search customers from local MiniSearch (< 100ms).
   */
  async searchCustomers(
    query: string,
    options?: { limit?: number }
  ): Promise<LocalCustomer[]> {
    if (!query.trim()) return [];
    await this.isCacheWarm();

    if (this.worker) {
      try {
        const results = await this.sendRequest<any[]>("SEARCH_CUSTOMERS", {
          query: query.trim(),
          limit: options?.limit ?? 30,
        });
        return results as LocalCustomer[];
      } catch {
        // Fallback below
      }
    }

    if (this.fallbackCustomerIndex) {
      const results = this.fallbackCustomerIndex.search(query.trim());
      return results.slice(0, options?.limit ?? 30) as unknown as LocalCustomer[];
    }

    // Direct Dexie fallback
    const q = query.toLowerCase();
    const rows = await offlineDb.customers.toArray();
    return rows
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.shopName && c.shopName.toLowerCase().includes(q)) ||
          c.phone.includes(query)
      )
      .slice(0, options?.limit ?? 30);
  }
}

export const searchClient = new SearchClient();
