import { authDb } from './auth-db';

const TTL_MS = 30_000;

export interface BranchAccess {
  allBranches: boolean;
  branchIds: Set<string>;
}

interface Entry {
  value: BranchAccess | null;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

/** Per-user branch access (30 s in-process cache). Null when the user no longer exists. */
export async function getUserBranchAccess(
  userId: string,
): Promise<BranchAccess | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.value;

  const row = await authDb().user.findUnique({
    where: { id: userId },
    select: {
      allBranches: true,
      branches: { select: { branchId: true } },
    },
  });
  const value = row
    ? {
        allBranches: row.allBranches,
        branchIds: new Set(row.branches.map((b) => b.branchId)),
      }
    : null;
  cache.set(userId, { value, expiresAt: now + TTL_MS });
  if (cache.size > 10_000) {
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
  return value;
}

/** Call after any change to a user's allBranches / UserBranch rows. */
export function invalidateUserBranches(userId: string): void {
  cache.delete(userId);
}
