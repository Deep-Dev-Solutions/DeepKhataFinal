/**
 * Seeds one day of shop activity on top of `npm run db:seed` so the dashboard,
 * POS, khata, cash hub and reports show today's numbers on demo day.
 *
 *   npm run demo:seed
 *   npm run demo:seed -- --sales=22 --collections=6 --expenses=5
 *   npm run demo:seed -- --slug=gm-traders --branch="Hall Road"
 *   npm run demo:seed -- --clear        (rewrite today's demo rows)
 *
 * Every row is written with a deterministic id derived from the date, so
 * running it twice on the same day adds nothing the second time. Running it on
 * a new day adds that day's trade and leaves the previous days as history.
 *
 * Ledger postings are created through `LedgerService`, the same code path the
 * API uses, so every transaction is balanced or the whole write rolls back.
 */
import * as path from 'path';
import { config } from 'dotenv';
import { ItemCondition, Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import {
  add,
  gt,
  gte,
  min,
  money,
  neg,
  sub,
  sum,
  ZERO,
} from '../src/common/money';

config({ path: path.resolve(__dirname, '../.env') });

const DAY_MS = 24 * 60 * 60 * 1000;

type Options = {
  slug: string;
  branch?: string;
  sales: number;
  collections: number;
  expenses: number;
};

type PaymentPlan = {
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  amountPaid: Prisma.Decimal;
  method: 'CASH' | 'BANK';
  needsCustomer: boolean;
};

const EXPENSE_PRESETS = [
  {
    category: 'CHAI_REFRESHMENT',
    description: 'Chai for the counter',
    amount: 340,
  },
  { category: 'DELIVERY_RIDER', description: 'Rider to Saddar', amount: 450 },
  { category: 'SUPPLIES', description: 'Packing bags and tape', amount: 620 },
  {
    category: 'REPAIR_PARTS',
    description: 'Screwdrivers for bench',
    amount: 900,
  },
  { category: 'UTILITIES', description: 'UPS battery charge', amount: 1200 },
];

/** Reads `--name=value` or `--name value`. */
function readArg(name: string): string | undefined {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function readCount(name: string, fallback: number): number {
  const raw = readArg(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name} needs a number of 0 or more`);
    process.exit(2);
  }
  return Math.floor(value);
}

function parseOptions(): Options {
  return {
    slug: readArg('slug') ?? 'gm-traders',
    branch: readArg('branch'),
    sales: readCount('sales', 16),
    collections: readCount('collections', 5),
    expenses: readCount('expenses', 4),
  };
}

/** Deterministic PRNG so the same day always produces the same shop day. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local time on the given day, so "today" matches the shop's clock. */
function atTime(day: Date, hour: number, minute: number): Date {
  const date = new Date(day);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** Spreads `count` moments across [startHour, endHour) of the day. */
function spread(
  day: Date,
  count: number,
  startHour: number,
  endHour: number,
): Date[] {
  if (count === 0) return [];
  const startMinutes = Math.round(startHour * 60);
  const windowMinutes = Math.max(0, Math.round((endHour - startHour) * 60));
  const step = count > 1 ? windowMinutes / (count - 1) : 0;

  return Array.from({ length: count }, (_, i) => {
    const minuteOfDay = startMinutes + Math.round(i * step);
    return atTime(day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  });
}

const rupees = (value: Prisma.Decimal) => `Rs. ${money(value).toFixed(0)}`;

/**
 * Removes the rows a previous run of this script wrote for one day, and puts
 * the stock it sold back on the shelf. Only touches ids this script owns.
 */
async function clearDay(
  prisma: PrismaService,
  key: string,
): Promise<{
  orders: number;
  expenses: number;
  instances: number;
  collections: number;
}> {
  const orders = await prisma.order.findMany({
    where: { id: { startsWith: `demo-${key}-sale` } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  const expenses = await prisma.expense.findMany({
    where: { id: { startsWith: `demo-${key}-expense` } },
    select: { id: true },
  });
  const expenseIds = expenses.map((expense) => expense.id);

  const movements = await prisma.inventoryMovement.findMany({
    where: { id: { startsWith: `demo-${key}-movement` } },
    select: { notes: true },
  });
  const instanceIds = movements
    .flatMap((movement) => (movement.notes ? movement.notes.split(',') : []))
    .filter((id) => id.length > 0);

  // Collections recorded against older (seeded) orders are today's rows too.
  const collections = await prisma.payment.findMany({
    where: { id: { startsWith: `demo-${key}-collect` } },
    select: { id: true, orderId: true },
  });
  const collectionIds = collections.map((payment) => payment.id);
  const collectedOrderIds = [
    ...new Set(collections.map((payment) => payment.orderId)),
  ];
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  await prisma.$transaction([
    prisma.transaction.deleteMany({
      where: {
        type: 'PAYMENT',
        referenceId: { in: collectedOrderIds },
        createdAt: { gte: dayStart },
      },
    }),
    prisma.payment.deleteMany({ where: { id: { in: collectionIds } } }),
    prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.expense.deleteMany({ where: { id: { in: expenseIds } } }),
    prisma.transaction.deleteMany({
      where: { referenceId: { in: [...orderIds, ...expenseIds] } },
    }),
    prisma.inventoryMovement.deleteMany({
      where: { id: { startsWith: `demo-${key}-movement` } },
    }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.productInstance.updateMany({
      where: { id: { in: instanceIds } },
      data: { status: 'AVAILABLE' },
    }),
  ]);

  // Put the khata balances of the orders those collections touched back.
  for (const orderId of collectedOrderIds) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        totalAmount: true,
        payments: { select: { amount: true } },
      },
    });
    if (!order) continue;
    const paid = sum(order.payments.map((payment) => payment.amount));
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: gte(paid, order.totalAmount)
          ? 'PAID'
          : gt(paid, 0)
            ? 'PARTIAL'
            : 'UNPAID',
      },
    });
  }

  return {
    orders: orderIds.length,
    expenses: expenseIds.length,
    instances: instanceIds.length,
    collections: collectionIds.length,
  };
}

async function main() {
  const options = parseOptions();
  const prisma = new PrismaService();
  const ledger = new LedgerService(prisma);

  try {
    const business = await prisma.business.findFirst({
      where: { slug: options.slug },
      select: { id: true, name: true, slug: true },
    });
    if (!business) {
      console.error(
        `No business with slug "${options.slug}". Run "npm run db:seed" first.`,
      );
      process.exitCode = 1;
      return;
    }

    const branch = options.branch
      ? await prisma.branch.findFirst({
          where: {
            businessId: business.id,
            name: options.branch,
            deletedAt: null,
          },
          select: { id: true, name: true },
        })
      : await prisma.branch.findFirst({
          where: { businessId: business.id, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true },
        });

    if (!branch) {
      console.error(
        options.branch
          ? `Branch "${options.branch}" not found in ${business.name}.`
          : `No branches in ${business.name}. Run "npm run db:seed" first.`,
      );
      process.exitCode = 1;
      return;
    }

    const owner = await prisma.user.findFirst({
      where: { businessId: business.id, role: 'OWNER' },
      select: { id: true, name: true },
    });
    if (!owner) {
      console.error(
        `No OWNER user in ${business.name}. Run "npm run db:seed" first.`,
      );
      process.exitCode = 1;
      return;
    }

    const today = new Date();
    const key = dayKey(today);
    // Never write sales into the future: the window ends at the current time.
    const nowHours = today.getHours() + today.getMinutes() / 60;
    const saleEnd = Math.min(20, nowHours);
    const saleStart = Math.max(9, Math.min(11, saleEnd - 2));
    const collectionEnd = Math.min(19, nowHours);
    const collectionStart = Math.max(10, collectionEnd - 6);
    const expenseEnd = Math.min(19, nowHours);
    const expenseStart = Math.max(11, expenseEnd - 5);
    const rng = mulberry32(hashString(key));
    const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];

    const customers = await prisma.customer.findMany({
      where: { businessId: business.id, deletedAt: null },
      select: { id: true, name: true },
      take: 40,
      orderBy: { name: 'asc' },
    });
    if (customers.length === 0) {
      console.error(
        'No customers to sell udhar to. Run "npm run db:seed" first.',
      );
      process.exitCode = 1;
      return;
    }

    if (process.argv.includes('--clear')) {
      const cleared = await clearDay(prisma, key);
      console.log(
        `Cleared ${cleared.orders} sales, ${cleared.collections} collections and ${cleared.expenses} expenses from ${key} (${cleared.instances} units back in stock).`,
      );
    }

    const stats = {
      sales: 0,
      skippedSales: 0,
      gross: ZERO as Prisma.Decimal,
      saleCash: ZERO as Prisma.Decimal,
      collected: ZERO as Prisma.Decimal,
      udhar: ZERO as Prisma.Decimal,
      collections: 0,
      expenses: 0,
      expenseTotal: ZERO as Prisma.Decimal,
    };

    // ---------------------------------------------------------------- session
    const session =
      (await prisma.cashRegisterSession.findFirst({
        where: { businessId: business.id, branchId: branch.id, status: 'OPEN' },
        select: { id: true },
      })) ??
      (await prisma.cashRegisterSession.create({
        data: {
          businessId: business.id,
          branchId: branch.id,
          openedById: owner.id,
          status: 'OPEN',
          openingBalance: new Prisma.Decimal(5000),
          openedAt: atTime(today, 10, 0),
        },
        select: { id: true },
      }));

    // ------------------------------------------------------------------ sales
    const instances = await prisma.productInstance.findMany({
      where: {
        branchId: branch.id,
        status: 'AVAILABLE',
        product: { businessId: business.id, deletedAt: null },
      },
      select: {
        id: true,
        productId: true,
        cabinetId: true,
        condition: true,
        product: { select: { name: true, basePrice: true } },
      },
      take: 400,
    });

    const byProduct = new Map<string, typeof instances>();
    for (const instance of instances) {
      const bucket = byProduct.get(instance.productId) ?? [];
      bucket.push(instance);
      byProduct.set(instance.productId, bucket);
    }
    const sellable = [...byProduct.values()];

    const saleTimes = spread(today, options.sales, saleStart, saleEnd);

    for (let i = 0; i < saleTimes.length; i++) {
      const orderId = `demo-${key}-sale-${i}`;
      const at = saleTimes[i] as Date;

      if (
        await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true },
        })
      ) {
        stats.skippedSales++;
        continue;
      }
      if (sellable.length === 0) {
        stats.skippedSales++;
        continue;
      }

      const lineCount = Math.min(sellable.length, 1 + Math.floor(rng() * 3));
      const chosen: Array<{
        productId: string;
        price: Prisma.Decimal;
        quantity: number;
        instanceIds: string[];
        cabinetId: string | null;
        condition: ItemCondition;
      }> = [];
      const usedProducts = new Set<string>();

      while (chosen.length < lineCount) {
        const bucket = pick(sellable);
        const first = bucket[0];
        if (!first || usedProducts.has(first.productId)) break;
        usedProducts.add(first.productId);

        const quantity = Math.min(
          bucket.length,
          bucket.length >= 2 && rng() < 0.15 ? 2 : 1,
        );
        chosen.push({
          productId: first.productId,
          price: money(first.product.basePrice),
          quantity,
          instanceIds: bucket.slice(0, quantity).map((inst) => inst.id),
          cabinetId: first.cabinetId,
          condition: first.condition,
        });
      }

      if (chosen.length === 0) {
        stats.skippedSales++;
        continue;
      }

      const gross = sum(
        chosen.map((line) => money(line.price).times(line.quantity)),
      );
      const discountCandidates = [0, 0, 0, 500, 1000, 2000].filter((value) =>
        money(value).lt(gross),
      );
      const discount = money(pick(discountCandidates));
      const net = sub(gross, discount);

      const roll = rng();
      let plan: PaymentPlan;
      if (roll < 0.5) {
        plan = {
          paymentStatus: 'PAID',
          amountPaid: net,
          method: 'CASH',
          needsCustomer: rng() < 0.45,
        };
      } else if (roll < 0.72) {
        plan = {
          paymentStatus: 'PAID',
          amountPaid: net,
          method: 'BANK',
          needsCustomer: rng() < 0.5,
        };
      } else if (roll < 0.88) {
        const part = net
          .times(0.4)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
        plan = {
          paymentStatus: 'PARTIAL',
          amountPaid: part,
          method: 'CASH',
          needsCustomer: true,
        };
      } else {
        plan = {
          paymentStatus: 'UNPAID',
          amountPaid: ZERO,
          method: 'CASH',
          needsCustomer: true,
        };
      }

      const customer = plan.needsCustomer ? pick(customers) : null;

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: orderId,
            businessId: business.id,
            branchId: branch.id,
            customerId: customer?.id ?? null,
            walkInName: customer ? null : 'Walk-in',
            totalAmount: net,
            discount,
            paymentStatus: plan.paymentStatus,
            status: 'FINAL',
            createdBy: owner.id,
            createdAt: at,
            dueDate:
              plan.paymentStatus === 'PAID'
                ? null
                : new Date(at.getTime() + 7 * DAY_MS),
            items: {
              create: chosen.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
                price: line.price,
              })),
            },
          },
        });

        for (const line of chosen) {
          await tx.productInstance.updateMany({
            where: { id: { in: line.instanceIds } },
            data: { status: 'SOLD' },
          });
          await tx.inventoryMovement.create({
            data: {
              id: `demo-${key}-movement-${i}-${line.productId}`,
              productId: line.productId,
              cabinetId: line.cabinetId,
              quantity: line.quantity,
              direction: 'OUT',
              referenceType: 'ORDER',
              referenceId: order.id,
              notes: line.instanceIds.join(','),
              userId: owner.id,
              businessId: business.id,
              branchId: branch.id,
              toCondition: line.condition,
              createdAt: at,
            },
          });
        }

        if (gt(plan.amountPaid, 0)) {
          await tx.payment.create({
            data: {
              id: `demo-${key}-payment-${i}`,
              orderId: order.id,
              amount: plan.amountPaid,
              method: plan.method,
              receivedBy: owner.id,
              createdAt: at,
            },
          });
        }

        const postings: Array<{
          accountId: string;
          accountType: string;
          amount: Prisma.Decimal;
        }> = [];
        const receivable = customer
          ? { accountId: customer.id, accountType: 'CUSTOMER_AR' }
          : { accountId: order.id, accountType: 'OTHER_AR' };

        if (gt(net, 0)) {
          postings.push({
            accountId: 'REVENUE',
            accountType: 'REVENUE',
            amount: neg(net),
          });
        }
        const cashPortion = min(plan.amountPaid, net);
        const udharPortion = sub(net, cashPortion);
        if (gt(cashPortion, 0)) {
          postings.push({
            accountId: 'CASH',
            accountType: 'ASSET',
            amount: cashPortion,
          });
        }
        if (gt(udharPortion, 0)) {
          postings.push({ ...receivable, amount: udharPortion });
        }

        if (postings.length > 0) {
          await ledger.createBalancedTransaction(
            {
              businessId: business.id,
              referenceId: order.id,
              type: 'SALE',
              description: `Sale for Order ${order.id}`,
              postings,
            },
            tx,
          );
        }
      });

      stats.sales++;
      stats.gross = add(stats.gross, net);
      stats.saleCash = add(stats.saleCash, min(plan.amountPaid, net));
      stats.udhar = add(stats.udhar, sub(net, min(plan.amountPaid, net)));
    }

    // ------------------------------------------------------------ collections
    const openOrders = await prisma.order.findMany({
      where: {
        businessId: business.id,
        status: 'FINAL',
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
      },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        createdAt: true,
        payments: { select: { id: true, amount: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 60,
    });

    const collectible = openOrders
      .map((order) => ({
        ...order,
        outstanding: sub(
          order.totalAmount,
          sum(order.payments.map((p) => p.amount)),
        ),
      }))
      .filter((order) => gt(order.outstanding, 0));

    const collectionTimes = spread(
      today,
      options.collections,
      collectionStart,
      collectionEnd,
    );

    for (let i = 0; i < collectionTimes.length; i++) {
      const paymentId = `demo-${key}-collect-${i}`;
      const at = collectionTimes[i] as Date;
      const target = collectible[i];

      if (!target) break;
      if (
        await prisma.payment.findUnique({
          where: { id: paymentId },
          select: { id: true },
        })
      ) {
        continue;
      }

      const amount =
        rng() < 0.7
          ? target.outstanding
          : target.outstanding
              .times(0.5)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

      if (!gt(amount, 0)) continue;

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            id: paymentId,
            orderId: target.id,
            amount,
            method: 'CASH',
            receivedBy: owner.id,
            createdAt: at,
          },
        });

        const paidSoFar = add(
          sum(target.payments.map((p) => p.amount)),
          amount,
        );
        await tx.order.update({
          where: { id: target.id },
          data: {
            paymentStatus: gte(paidSoFar, target.totalAmount)
              ? 'PAID'
              : 'PARTIAL',
          },
        });

        await ledger.createBalancedTransaction(
          {
            businessId: business.id,
            referenceId: target.id,
            type: 'PAYMENT',
            description: `Payment for Order ${target.id}`,
            postings: [
              { accountId: 'CASH', accountType: 'ASSET', amount },
              {
                accountId: target.customerId ?? target.id,
                accountType: target.customerId ? 'CUSTOMER_AR' : 'OTHER_AR',
                amount: neg(amount),
              },
            ],
          },
          tx,
        );
      });

      target.payments = [];
      target.outstanding = sub(target.outstanding, amount);
      stats.collections++;
      stats.collected = add(stats.collected, amount);
    }

    // ---------------------------------------------------------------- expenses
    const expenseTimes = spread(
      today,
      options.expenses,
      expenseStart,
      expenseEnd,
    );

    for (let i = 0; i < expenseTimes.length; i++) {
      const expenseId = `demo-${key}-expense-${i}`;
      const at = expenseTimes[i] as Date;
      const preset = EXPENSE_PRESETS[i % EXPENSE_PRESETS.length];
      if (!preset) continue;
      if (
        await prisma.expense.findUnique({
          where: { id: expenseId },
          select: { id: true },
        })
      ) {
        continue;
      }

      const amount = money(preset.amount);

      await prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            id: expenseId,
            businessId: business.id,
            branchId: branch.id,
            amount,
            category: preset.category,
            description: preset.description,
            createdById: owner.id,
            sessionId: session.id,
            createdAt: at,
          },
        });

        const transaction = await ledger.createBalancedTransaction(
          {
            businessId: business.id,
            referenceId: expense.id,
            type: 'EXPENSE',
            description: `Operational Expense: [${preset.category}] ${preset.description}`,
            postings: [
              { accountId: preset.category, accountType: 'EXPENSE', amount },
              { accountId: 'CASH', accountType: 'ASSET', amount: neg(amount) },
            ],
          },
          tx,
        );

        await tx.expense.update({
          where: { id: expense.id },
          data: { transactionId: transaction.id },
        });
      });

      stats.expenses++;
      stats.expenseTotal = add(stats.expenseTotal, amount);
    }

    // ------------------------------------------------------------- ledger gate
    const unbalanced = await prisma.$queryRaw<
      { transactionId: string; total: string }[]
    >`
      select p."transactionId", sum(p.amount)::text as total
      from "Posting" p
      join "Transaction" t on t.id = p."transactionId"
      where t."businessId" = ${business.id}
      group by 1 having sum(p.amount) <> 0`;

    const label = `${business.name} · ${branch.name} · ${key}`;
    console.log(`
Demo day seeded — ${label}

  Sales written      ${stats.sales}${stats.skippedSales > 0 ? ` (${stats.skippedSales} already existed)` : ''}
  Gross sales        ${rupees(stats.gross)}
  Taken at counter   ${rupees(stats.saleCash)}
  Udhar created      ${rupees(stats.udhar)}
  Collections        ${stats.collections} · ${rupees(stats.collected)}
  Petty cash out     ${stats.expenses} · ${rupees(stats.expenseTotal)}
  Ledger check       ${unbalanced.length === 0 ? 'balanced' : `UNBALANCED (${unbalanced.length})`}
`);

    if (unbalanced.length > 0) {
      console.error(unbalanced);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
