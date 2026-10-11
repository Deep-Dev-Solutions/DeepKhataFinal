import path from 'node:path';
import dotenv from 'dotenv';

// Load server env (does not override variables already set, e.g. in CI).
dotenv.config({ path: path.resolve(__dirname, '../server/.env'), quiet: true });

/**
 * Database used by the E2E suite. E2E_DATABASE_URL is preferred (dedicated DB so
 * it never collides with the API test DB); DATABASE_URL_TEST is the CI fallback.
 */
export function getE2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('Neither E2E_DATABASE_URL nor DATABASE_URL_TEST is set (apps/server/.env).');
  }
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run E2E against non-local database host "${host}".`);
  }
  return url;
}
