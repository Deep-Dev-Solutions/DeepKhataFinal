/**
 * Delta merge for `GET /sync/pull`. Pure over a small store interface so it can
 * be unit tested without IndexedDB; `pull.ts` provides the Dexie-backed store.
 */

export const PULL_ENTITIES = [
  "branches",
  "categories",
  "cabinets",
  "products",
  "customers",
  "vendors",
  "instances",
  "stockSummary",
] as const;

export type PullEntity = (typeof PULL_ENTITIES)[number];

export type Row = Record<string, unknown>;

export interface PullPage {
  entity: PullEntity;
  rows: Row[];
  deleted: string[];
  cursor: string;
  hasMore: boolean;
  serverTime?: string;
}

export interface MergePlan {
  /** Rows to upsert (bulkPut). */
  put: Row[];
  /** Ids to remove (tombstones, bulkDelete). */
  deleteIds: string[];
  /** Snapshot entity: drop every existing row first, then put. */
  replaceAll: boolean;
}

export interface MergeStore {
  /** Existing local rows by id (only used to keep fields the server does not send). */
  getExisting(entity: PullEntity, ids: string[]): Promise<Map<string, Row>>;
  /**
   * Applies the plan and saves the cursor. Implementations must make this
   * atomic: the cursor is written only after the rows were applied.
   */
  commit(
    entity: PullEntity,
    plan: MergePlan,
    cursorKey: string,
    cursor: string,
  ): Promise<void>;
  getMeta(key: string): Promise<string | null>;
}

export function cursorKey(entity: PullEntity, branchId: string | null): string {
  return `cursor:${entity}:${branchId ?? "none"}`;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Shapes a server row for the local tables. The POS still reads `price`/`stock`
 * (products) and a numeric `creditLimit` (customers), and vendors are searched
 * by `name`, so those are derived here; fields the server does not send are
 * kept from the existing local row.
 */
export function normalizeRow(
  entity: PullEntity,
  row: Row,
  existing: Row | undefined,
): Row {
  switch (entity) {
    case "products": {
      const price =
        toNumber(row.basePrice) ?? toNumber(existing?.price) ?? 0;
      const stock = toNumber(existing?.stock) ?? 0;
      return { ...existing, ...row, price, stock };
    }
    case "customers": {
      const creditLimit = toNumber(row.creditLimit);
      return {
        ...existing,
        ...row,
        ...(creditLimit !== undefined ? { creditLimit } : {}),
      };
    }
    case "vendors":
      return {
        ...existing,
        ...row,
        name: (row.name as string | undefined) ?? (row.businessName as string),
      };
    default:
      return row;
  }
}

const NEEDS_EXISTING: ReadonlySet<PullEntity> = new Set([
  "products",
  "customers",
]);

/** Pure: what to write for one page. */
export function planPage(
  entity: PullEntity,
  page: Pick<PullPage, "rows" | "deleted">,
  existing: Map<string, Row>,
): MergePlan {
  const rows = page.rows ?? [];
  const put = rows.map((row) =>
    normalizeRow(entity, row, existing.get(String(row.id))),
  );
  return {
    put,
    deleteIds: page.deleted ?? [],
    replaceAll: entity === "stockSummary",
  };
}

/** Applies one page. The cursor is saved by `commit`, after the rows. */
export async function applyPage(
  store: MergeStore,
  entity: PullEntity,
  page: PullPage,
  branchId: string | null,
): Promise<void> {
  const ids = NEEDS_EXISTING.has(entity)
    ? (page.rows ?? []).map((r) => String(r.id))
    : [];
  const existing = ids.length
    ? await store.getExisting(entity, ids)
    : new Map<string, Row>();
  const plan = planPage(entity, page, existing);
  await store.commit(entity, plan, cursorKey(entity, branchId), page.cursor);
}

export interface PullDeps {
  store: MergeStore;
  fetchPage(entity: PullEntity, cursor: string | null): Promise<PullPage>;
}

const MAX_PAGES = 500;

/**
 * Pulls one entity until the server says there is nothing more. Returns the
 * number of pages applied. A snapshot entity (stockSummary) ignores cursors.
 */
export async function pullEntity(
  deps: PullDeps,
  entity: PullEntity,
  branchId: string | null,
): Promise<number> {
  const key = cursorKey(entity, branchId);
  let cursor =
    entity === "stockSummary" ? null : await deps.store.getMeta(key);
  let pages = 0;
  while (pages < MAX_PAGES) {
    const page = await deps.fetchPage(entity, cursor);
    await applyPage(deps.store, entity, page, branchId);
    pages++;
    if (!page.hasMore || page.cursor === cursor) break;
    cursor = page.cursor;
  }
  return pages;
}
