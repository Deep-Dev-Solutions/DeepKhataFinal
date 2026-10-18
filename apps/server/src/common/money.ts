import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export const ZERO: Prisma.Decimal = new Prisma.Decimal(0);

/** Convert any money-ish input to a Decimal. null/undefined -> 0. No rounding. */
export function money(v: MoneyInput): Prisma.Decimal {
  if (v === null || v === undefined) return new Prisma.Decimal(0);
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(v);
}

/** Round to 2 decimal places, ROUND_HALF_UP. */
export function round2(v: MoneyInput): Prisma.Decimal {
  return money(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function add(...vs: MoneyInput[]): Prisma.Decimal {
  return sum(vs);
}

export function sub(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return money(a).minus(money(b));
}

/** Multiply and round the result to 2 dp. */
export function mul(a: MoneyInput, factor: MoneyInput): Prisma.Decimal {
  return round2(money(a).times(money(factor)));
}

export function sum(vs: MoneyInput[]): Prisma.Decimal {
  return vs.reduce<Prisma.Decimal>((acc, v) => acc.plus(money(v)), new Prisma.Decimal(0));
}

export function neg(v: MoneyInput): Prisma.Decimal {
  return money(v).negated();
}

export function cmp(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  const c = money(a).comparedTo(money(b));
  return c > 0 ? 1 : c < 0 ? -1 : 0;
}

export function gt(a: MoneyInput, b: MoneyInput): boolean {
  return cmp(a, b) === 1;
}
export function gte(a: MoneyInput, b: MoneyInput): boolean {
  return cmp(a, b) >= 0;
}
export function lt(a: MoneyInput, b: MoneyInput): boolean {
  return cmp(a, b) === -1;
}
export function lte(a: MoneyInput, b: MoneyInput): boolean {
  return cmp(a, b) <= 0;
}
export function eq(a: MoneyInput, b: MoneyInput): boolean {
  return cmp(a, b) === 0;
}

export function isZero(v: MoneyInput): boolean {
  return money(v).isZero();
}

export function max(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return gte(a, b) ? money(a) : money(b);
}

export function min(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return lte(a, b) ? money(a) : money(b);
}

/** Convert to a JS number rounded to 2 dp, for API responses. */
export function toApi(v: MoneyInput): number {
  return Number(round2(v).toFixed(2));
}

let jsonInstalled = false;

/** Idempotent. Makes Decimal serialize as a 2dp number in JSON responses. */
export function installDecimalJson(): void {
  if (jsonInstalled) return;
  jsonInstalled = true;
  (Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON =
    function (this: Prisma.Decimal) {
      return Number(this.toFixed(2));
    };
}
