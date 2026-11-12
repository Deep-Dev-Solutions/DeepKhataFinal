import { Prisma } from '@prisma/client';

/** Every generated product SKU and unit code starts with this prefix. */
export const SKU_PREFIX = 'SKU-';

/**
 * Next `count` per-unit codes for a product, continuing from the highest
 * existing suffix. Units numbered `SKU-0007-1` and `SKU-0007-2` continue at
 * `SKU-0007-3`, so a restock can never reuse a code that is already on a unit
 * (including units that were sold or moved).
 *
 * Codes are derived from the product SKU; a product without one gets no codes.
 */
export async function nextSerials(
  tx: Prisma.TransactionClient,
  productId: string,
  sku: string | null | undefined,
  count: number,
): Promise<(string | null)[]> {
  const base = sku?.trim();
  const qty = Math.max(0, Math.trunc(count));
  if (!base) return Array.from({ length: qty }, () => null);
  if (qty === 0) return [];

  const rows = await tx.productInstance.findMany({
    where: { productId, serialNumber: { startsWith: `${base}-` } },
    select: { serialNumber: true },
  });

  let highest = 0;
  for (const row of rows) {
    const suffix = row.serialNumber?.slice(base.length + 1) ?? '';
    if (/^\d+$/.test(suffix)) highest = Math.max(highest, Number(suffix));
  }

  return Array.from({ length: qty }, (_, i) => `${base}-${highest + i + 1}`);
}
