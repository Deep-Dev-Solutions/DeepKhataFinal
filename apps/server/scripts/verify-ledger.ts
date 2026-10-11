import * as path from 'path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const idx = process.argv.indexOf('--business');
  const businessId = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (idx >= 0 && !businessId) {
    console.error('--business requires an id');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const biz = businessId ?? null;

    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from "Transaction" t
      where (${biz}::text is null or t."businessId" = ${biz}::text)`;

    const unbalanced = await prisma.$queryRaw<
      { transactionId: string; total: string }[]
    >`
      select p."transactionId", sum(p.amount)::text as total
      from "Posting" p
      join "Transaction" t on t.id = p."transactionId"
      where (${biz}::text is null or t."businessId" = ${biz}::text)
      group by 1 having sum(p.amount) <> 0`;

    const empty = await prisma.$queryRaw<{ id: string }[]>`
      select t.id from "Transaction" t
      where (${biz}::text is null or t."businessId" = ${biz}::text)
        and not exists (select 1 from "Posting" p where p."transactionId" = t.id)`;

    if (unbalanced.length === 0 && empty.length === 0) {
      console.log(`Ledger OK: ${count} transactions checked`);
      return;
    }

    console.error(`Ledger DRIFT: ${count} transactions checked`);
    for (const r of unbalanced) {
      console.error(`  unbalanced ${r.transactionId}: sum=${r.total}`);
    }
    for (const r of empty) {
      console.error(`  no postings ${r.id}`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
