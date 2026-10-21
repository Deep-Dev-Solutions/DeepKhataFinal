import { randomInt } from 'node:crypto';

/**
 * A random, valid Pakistani mobile number (03XXXXXXXXX). Onboarding claims one
 * trial per phone, so every test business needs its own number.
 */
export function uniquePkMobile(): string {
  return `03${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
}
