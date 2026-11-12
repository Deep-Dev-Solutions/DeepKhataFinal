/**
 * One-off: attach orphan expense vouchers (sessionId = null) to the galla
 * session whose window covered them, so old vouchers show in their Z-report.
 *
 *   npm run expenses:attach-orphans -w server            (dry run, prints only)
 *   npm run expenses:attach-orphans -w server -- --apply  (writes sessionId)
 *
 * Production steps (run by the operator, never from this repo's tooling):
 *   1. Take a database backup / snapshot first.
 *   2. Dry run against production DATABASE_URL and read the "unplaceable" list.
 *   3. Re-run with --apply, then check a known Z-report in the galla screen.
 * Safe to re-run: only rows that still have no session are touched.
 */
import * as path from 'path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../.env') });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`--${name} requires a value`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const businessId = arg('business');
  const prisma = new PrismaClient();

  try {
    const orphans = await prisma.expense.findMany({
      where: {
        sessionId: null,
        ...(businessId ? { businessId } : {}),
      },
      select: {
        id: true,
        businessId: true,
        branchId: true,
        amount: true,
        category: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `${orphans.length} expense(s) with no galla session${businessId ? ` in business ${businessId}` : ''}.`,
    );
    if (!apply) console.log('Dry run: pass --apply to attach them.');

    let attached = 0;
    const unplaceable: typeof orphans = [];

    for (const expense of orphans) {
      if (!expense.branchId) {
        unplaceable.push(expense);
        continue;
      }

      const session = await prisma.cashRegisterSession.findFirst({
        where: {
          businessId: expense.businessId,
          branchId: expense.branchId,
          openedAt: { lte: expense.createdAt },
          OR: [{ closedAt: null }, { closedAt: { gte: expense.createdAt } }],
        },
        select: { id: true, openedAt: true, closedAt: true },
        orderBy: { openedAt: 'desc' },
      });

      if (!session) {
        unplaceable.push(expense);
        continue;
      }

      console.log(
        `${apply ? 'attach' : 'would attach'} ${expense.id} ${expense.category} Rs ${expense.amount} @ ${expense.createdAt.toISOString()} -> session ${session.id}`,
      );
      if (apply) {
        await prisma.expense.update({
          where: { id: expense.id },
          data: { sessionId: session.id },
        });
      }
      attached += 1;
    }

    if (unplaceable.length > 0) {
      console.log(`\n${unplaceable.length} voucher(s) could not be placed:`);
      for (const expense of unplaceable) {
        console.log(
          `  ${expense.id} branch=${expense.branchId ?? 'none'} ${expense.category} Rs ${expense.amount} @ ${expense.createdAt.toISOString()}`,
        );
      }
    }

    console.log(
      `\n${apply ? 'Attached' : 'Would attach'} ${attached} of ${orphans.length} voucher(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
