import { Prisma } from '@prisma/client';

/** Initials of a branch name, used when a branch has no explicit code yet. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .join('')
    .toUpperCase();
  if (words.length >= 2) return words.slice(0, 4);
  const letters = (name ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 2) || 'BR').padEnd(2, 'X');
}

/** Short code for a branch: stored code first, initials as the fallback. */
export function branchCode(
  branch: { code?: string | null; name?: string | null } | null | undefined,
): string {
  const stored = branch?.code?.trim().toUpperCase();
  if (stored && stored.length >= 2) return stored.slice(0, 4);
  return initialsOf(branch?.name);
}

/** Human display of an order number: `HR-10`, `LB-1`. */
export function formatOrderLabel(
  orderNumber: number | null | undefined,
  branch?: { code?: string | null; name?: string | null } | null,
): string {
  return `${branchCode(branch)}-${orderNumber ?? 0}`;
}

/**
 * Next order number for a branch. The upsert locks the counter row, so two
 * concurrent sales (or two offline tills syncing at once) never share a number.
 * Call it inside the order's transaction: the number is never handed out for a
 * sale that rolls back.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  branchId: string,
): Promise<number> {
  // INSERT .. ON CONFLICT DO UPDATE is a single atomic statement, so twenty
  // concurrent sales (or two syncing tills) cannot read the same `last`.
  const rows = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "OrderNumberSequence" ("businessId", "branchId", "last")
    VALUES (${businessId}, ${branchId}, 1)
    ON CONFLICT ("businessId", "branchId")
    DO UPDATE SET "last" = "OrderNumberSequence"."last" + 1
    RETURNING "last"
  `;
  return Number(rows[0]?.last ?? 1);
}
