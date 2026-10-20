import { db } from './db';

/**
 * Double-entry invariant: for every Transaction, the sum of posting amounts is 0.
 * Pass businessId to scope the check to one tenant.
 */
export async function expectLedgerBalanced(businessId?: string): Promise<void> {
  const grouped = await db.posting.groupBy({
    by: ['transactionId'],
    _sum: { amount: true },
    where: businessId ? { transaction: { businessId } } : undefined,
  });
  const offenders = grouped.filter((g) => Math.abs(Number(g._sum.amount ?? 0)) > 0.001);
  if (offenders.length > 0) {
    const list = offenders.map((o) => `${o.transactionId} (sum=${Number(o._sum.amount)})`).join(', ');
    throw new Error(`Unbalanced ledger transactions: ${list}`);
  }
}
