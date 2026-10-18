import { describe, expect, it } from "vitest";
import {
  applyPage,
  cursorKey,
  planPage,
  pullEntity,
  type MergePlan,
  type MergeStore,
  type PullEntity,
  type PullPage,
  type Row,
} from "../merge";

/** In-memory store that logs the order of writes. */
class MemoryStore implements MergeStore {
  tables = new Map<PullEntity, Map<string, Row>>();
  meta = new Map<string, string>();
  log: string[] = [];
  failCommit = false;

  table(entity: PullEntity): Map<string, Row> {
    let t = this.tables.get(entity);
    if (!t) {
      t = new Map();
      this.tables.set(entity, t);
    }
    return t;
  }

  keyOf(entity: PullEntity, row: Row): string {
    return entity === "stockSummary"
      ? `${row.productId}|${row.branchId}|${row.condition}`
      : String(row.id);
  }

  async getExisting(entity: PullEntity, ids: string[]) {
    const out = new Map<string, Row>();
    for (const id of ids) {
      const row = this.table(entity).get(id);
      if (row) out.set(id, row);
    }
    return out;
  }

  async commit(entity: PullEntity, plan: MergePlan, key: string, cursor: string) {
    if (this.failCommit) throw new Error("disk full");
    const t = this.table(entity);
    if (plan.replaceAll) {
      t.clear();
      this.log.push(`clear:${entity}`);
    }
    for (const id of plan.deleteIds) t.delete(id);
    if (plan.deleteIds.length) this.log.push(`delete:${plan.deleteIds.join(",")}`);
    for (const row of plan.put) t.set(this.keyOf(entity, row), row);
    if (plan.put.length) this.log.push(`put:${plan.put.length}`);
    this.meta.set(key, cursor);
    this.log.push(`cursor:${cursor}`);
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
}

const page = (p: Partial<PullPage> & { entity: PullEntity }): PullPage => ({
  rows: [],
  deleted: [],
  cursor: "c1",
  hasMore: false,
  ...p,
});

describe("delta merge", () => {
  it("inserts new rows and updates existing ones", async () => {
    const store = new MemoryStore();
    await applyPage(
      store,
      "categories",
      page({
        entity: "categories",
        rows: [
          { id: "c1", name: "Tyres" },
          { id: "c2", name: "Oil" },
        ],
      }),
      "b1",
    );
    await applyPage(
      store,
      "categories",
      page({
        entity: "categories",
        rows: [{ id: "c2", name: "Engine oil" }],
        cursor: "c2",
      }),
      "b1",
    );
    expect([...store.table("categories").values()]).toEqual([
      { id: "c1", name: "Tyres" },
      { id: "c2", name: "Engine oil" },
    ]);
  });

  it("removes tombstoned ids", async () => {
    const store = new MemoryStore();
    await applyPage(
      store,
      "customers",
      page({ entity: "customers", rows: [{ id: "u1", name: "A", phone: "1" }, { id: "u2", name: "B", phone: "2" }] }),
      "b1",
    );
    await applyPage(
      store,
      "customers",
      page({ entity: "customers", deleted: ["u1"], cursor: "c2" }),
      "b1",
    );
    expect([...store.table("customers").keys()]).toEqual(["u2"]);
  });

  it("replaces the whole stockSummary snapshot", async () => {
    const store = new MemoryStore();
    const old = { productId: "p1", branchId: "bx", condition: "NEW", available: 5 };
    await applyPage(store, "stockSummary", page({ entity: "stockSummary", rows: [old] }), "b1");
    const fresh = { productId: "p2", branchId: "by", condition: "USED", available: 2 };
    await applyPage(store, "stockSummary", page({ entity: "stockSummary", rows: [fresh], cursor: "c2" }), "b1");
    expect([...store.table("stockSummary").values()]).toEqual([fresh]);

    // An empty snapshot (no stock anywhere else) clears stale rows too.
    await applyPage(store, "stockSummary", page({ entity: "stockSummary", cursor: "c3" }), "b1");
    expect(store.table("stockSummary").size).toBe(0);
  });

  it("saves the cursor only after the rows were applied", async () => {
    const store = new MemoryStore();
    await applyPage(
      store,
      "branches",
      page({ entity: "branches", rows: [{ id: "b1", name: "Main" }], cursor: "abc" }),
      "b1",
    );
    const putAt = store.log.findIndex((l) => l.startsWith("put:"));
    const cursorAt = store.log.findIndex((l) => l.startsWith("cursor:"));
    expect(putAt).toBeGreaterThanOrEqual(0);
    expect(cursorAt).toBeGreaterThan(putAt);
    expect(store.meta.get(cursorKey("branches", "b1"))).toBe("abc");
  });

  it("keeps the old cursor when applying the page fails", async () => {
    const store = new MemoryStore();
    store.meta.set(cursorKey("branches", "b1"), "old");
    store.failCommit = true;
    await expect(
      applyPage(store, "branches", page({ entity: "branches", rows: [{ id: "b1", name: "M" }], cursor: "new" }), "b1"),
    ).rejects.toThrow("disk full");
    expect(store.meta.get(cursorKey("branches", "b1"))).toBe("old");
  });

  it("keeps the cursor per entity and branch", async () => {
    const store = new MemoryStore();
    await applyPage(store, "products", page({ entity: "products", cursor: "p-a" }), "bA");
    await applyPage(store, "products", page({ entity: "products", cursor: "p-b" }), "bB");
    expect(store.meta.get("cursor:products:bA")).toBe("p-a");
    expect(store.meta.get("cursor:products:bB")).toBe("p-b");
    expect(cursorKey("instances", null)).toBe("cursor:instances:none");
  });

  it("derives POS fields for products and keeps local stock", async () => {
    const store = new MemoryStore();
    store.table("products").set("p1", { id: "p1", name: "Old", price: 1, stock: 7, category: { name: "X" } });
    await applyPage(
      store,
      "products",
      page({
        entity: "products",
        rows: [
          { id: "p1", name: "Brake pad", basePrice: "1250.50", partNumber: "BP-1", updatedAt: "t" },
          { id: "p2", name: "Filter", basePrice: "300.00" },
        ],
      }),
      "b1",
    );
    expect(store.table("products").get("p1")).toMatchObject({
      name: "Brake pad",
      price: 1250.5,
      stock: 7,
      partNumber: "BP-1",
      category: { name: "X" },
    });
    expect(store.table("products").get("p2")).toMatchObject({ price: 300, stock: 0 });
  });

  it("maps vendor businessName to name and customer creditLimit to a number", () => {
    const vendors = planPage("vendors", { rows: [{ id: "v1", businessName: "Acme" }], deleted: [] }, new Map());
    expect(vendors.put[0]).toMatchObject({ id: "v1", name: "Acme" });
    const customers = planPage("customers", { rows: [{ id: "c1", name: "A", creditLimit: "5000.00" }], deleted: [] }, new Map());
    expect(customers.put[0].creditLimit).toBe(5000);
  });
});

describe("pullEntity", () => {
  it("loops while hasMore, resumes from the stored cursor and stops at the end", async () => {
    const store = new MemoryStore();
    store.meta.set(cursorKey("customers", "b1"), "start");
    const seen: Array<string | null> = [];
    const pages: PullPage[] = [
      page({ entity: "customers", rows: [{ id: "u1", name: "A", phone: "1" }], cursor: "c-1", hasMore: true }),
      page({ entity: "customers", rows: [{ id: "u2", name: "B", phone: "2" }], cursor: "c-2", hasMore: true }),
      page({ entity: "customers", rows: [{ id: "u3", name: "C", phone: "3" }], cursor: "c-3", hasMore: false }),
    ];
    const n = await pullEntity(
      {
        store,
        fetchPage: async (_e, cursor) => {
          seen.push(cursor);
          return pages[seen.length - 1];
        },
      },
      "customers",
      "b1",
    );
    expect(n).toBe(3);
    expect(seen).toEqual(["start", "c-1", "c-2"]);
    expect(store.table("customers").size).toBe(3);
    expect(store.meta.get(cursorKey("customers", "b1"))).toBe("c-3");
  });

  it("stops on a repeated cursor instead of looping forever", async () => {
    const store = new MemoryStore();
    let calls = 0;
    await pullEntity(
      {
        store,
        fetchPage: async () => {
          calls++;
          return page({ entity: "vendors", cursor: "same", hasMore: true });
        },
      },
      "vendors",
      "b1",
    );
    expect(calls).toBe(2);
  });

  it("does not send a cursor for the stockSummary snapshot", async () => {
    const store = new MemoryStore();
    store.meta.set(cursorKey("stockSummary", "b1"), "ignored");
    let sent: string | null = "unset";
    await pullEntity(
      {
        store,
        fetchPage: async (_e, cursor) => {
          sent = cursor;
          return page({ entity: "stockSummary" });
        },
      },
      "stockSummary",
      "b1",
    );
    expect(sent).toBeNull();
  });
});
