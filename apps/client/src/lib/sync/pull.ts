import { offlineDb } from "@/lib/db";
import { SyncHttpError, syncFetch } from "./http";
import {
  PULL_ENTITIES,
  pullEntity,
  type MergePlan,
  type MergeStore,
  type PullEntity,
  type PullPage,
  type Row,
} from "./merge";

const PAGE_LIMIT = 1000;

/** Dexie-backed store: rows, tombstones and the cursor are written in one transaction. */
export const dexieMergeStore: MergeStore = {
  async getExisting(entity, ids) {
    const rows = (await offlineDb.table(entity).bulkGet(ids)) as Array<
      Row | undefined
    >;
    const map = new Map<string, Row>();
    for (const row of rows) {
      if (row) map.set(String(row.id), row);
    }
    return map;
  },

  async commit(entity, plan: MergePlan, cursorKey, cursor) {
    const table = offlineDb.table(entity);
    await offlineDb.transaction("rw", table, offlineDb.meta, async () => {
      if (plan.replaceAll) await table.clear();
      if (plan.deleteIds.length) await table.bulkDelete(plan.deleteIds);
      if (plan.put.length) await table.bulkPut(plan.put);
      await offlineDb.meta.put({ key: cursorKey, value: cursor });
    });
  },

  async getMeta(key) {
    const row = await offlineDb.meta.get(key);
    return typeof row?.value === "string" ? row.value : null;
  },
};

async function fetchPage(
  entity: PullEntity,
  cursor: string | null,
  branchId: string | null,
): Promise<PullPage> {
  const qs = new URLSearchParams({ entity, limit: String(PAGE_LIMIT) });
  if (cursor) qs.set("cursor", cursor);
  const res = await syncFetch(`/sync/pull?${qs.toString()}`, { branchId });
  if (!res.ok) throw new SyncHttpError(res.status);
  const body = (await res.json()) as Partial<PullPage>;
  return {
    entity,
    rows: body.rows ?? [],
    deleted: body.deleted ?? [],
    cursor: body.cursor ?? "",
    hasMore: Boolean(body.hasMore),
    serverTime: body.serverTime,
  };
}

/**
 * Pulls every entity for the active branch, in dependency order. An entity the
 * role may not read (403/404) is skipped; any other failure aborts the run.
 */
export async function pullAllEntities(branchId: string | null): Promise<void> {
  for (const entity of PULL_ENTITIES) {
    if (entity === "instances" && !branchId) continue;
    try {
      await pullEntity(
        {
          store: dexieMergeStore,
          fetchPage: (e, cursor) => fetchPage(e, cursor, branchId),
        },
        entity,
        branchId,
      );
    } catch (err) {
      if (
        err instanceof SyncHttpError &&
        (err.status === 403 || err.status === 404)
      ) {
        continue;
      }
      throw err;
    }
  }
}
