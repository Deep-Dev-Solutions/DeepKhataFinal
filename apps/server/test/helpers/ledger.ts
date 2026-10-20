import { PrismaClient } from '@prisma/client';

/**
 * Asserts the double-entry invariant: every Transaction's postings sum to
 * exactly 0. With `transactionIds`, checks only those (each must have postings);
 * otherwise checks every transaction in the database.
 */
export async function expectBalanced(
  prisma: PrismaClient,
  transactionIds?: string[],
): Promise<void> {
  if (transactionIds && transactionIds.length === 0) {
    throw new Error('expectBalanced called with an empty transactionIds list');
  }
  const grouped = await prisma.posting.groupBy({
    by: ['transactionId'],
    where: transactionIds ? { transactionId: { in: transactionIds } } : undefined,
    _sum: { amount: true },
    _count: { _all: true },
  });
  if (transactionIds) {
    const seen = new Set(grouped.map((g) => g.transactionId));
    const missing = transactionIds.filter((id) => !seen.has(id));
    expect(missing, 'transactions with no postings').toEqual([]);
  }
  const unbalanced = grouped
    .filter((g) => !(g._sum.amount?.isZero() ?? true))
    .map((g) => ({ transactionId: g.transactionId, sum: g._sum.amount?.toString() }));
  expect(unbalanced, 'transactions whose postings do not sum to 0').toEqual([]);
}
