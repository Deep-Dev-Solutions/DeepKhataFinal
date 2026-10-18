import * as path from 'path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { addDays, karachiDateOnly } from '../src/common/dates';
import {
  eachUsageDay,
  rollupDay,
  toUsageDate,
  usageDateString,
} from '../src/analytics/usage-compute';

config({ path: path.resolve(__dirname, '../.env') });

/**
 * npm run usage:backfill -w server -- --from 2026-01-01 [--to 2026-03-31] [--business <id>]
 * `--to` defaults to yesterday (Karachi). Safe to re-run: rows are upserted.
 */
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
  const fromArg = arg('from');
  if (!fromArg) {
    console.error('Usage: usage:backfill --from YYYY-MM-DD [--to YYYY-MM-DD] [--business <id>]');
    process.exit(2);
  }
  const from = toUsageDate(fromArg);
  const to = arg('to')
    ? toUsageDate(arg('to') as string)
    : addDays(karachiDateOnly(new Date()), -1);
  const businessId = arg('business');
  if (from.getTime() > to.getTime()) {
    console.error('--from must not be after --to');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    let rows = 0;
    const days = eachUsageDay(from, to);
    for (const day of days) {
      const n = await rollupDay(prisma, day, businessId);
      rows += n;
      console.log(`${usageDateString(day)}: ${n} rows`);
    }
    console.log(`Backfill done: ${days.length} days, ${rows} rows`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
