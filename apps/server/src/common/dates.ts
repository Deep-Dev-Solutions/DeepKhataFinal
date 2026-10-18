/**
 * Karachi date helpers. Asia/Karachi is UTC+5 year-round (no DST), so a fixed
 * offset is exact and avoids Intl/timezone-database dependence.
 */
export const TZ = 'Asia/Karachi';

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of the Karachi calendar date for the instant `d`. */
export function karachiDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Date at UTC midnight of the Karachi calendar date (for @db.Date columns). */
export function karachiDateOnly(d: Date = new Date()): Date {
  return new Date(`${karachiDateString(d)}T00:00:00.000Z`);
}

/** UTC instant of 00:00 Karachi time on the Karachi calendar day of `d`. */
export function startOfKarachiDay(d: Date = new Date()): Date {
  return new Date(karachiDateOnly(d).getTime() - OFFSET_MS);
}

/** Adds `n` (possibly negative) 24h days. Safe because Karachi has no DST. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Whole Karachi calendar days from `from` to `to` (to - from). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (karachiDateOnly(to).getTime() - karachiDateOnly(from).getTime()) / DAY_MS,
  );
}
