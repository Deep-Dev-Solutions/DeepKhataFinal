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

/**
 * Ports and per-run directories. Defaults match the single local run; set
 * E2E_API_PORT / E2E_WEB_PORT / E2E_RUN_ID (plus E2E_DATABASE_URL) to run
 * several suites side by side without sharing servers, DB or auth state.
 */
const runId = process.env.E2E_RUN_ID || '';
const suffix = runId ? `-${runId}` : '';
export const E2E = {
  apiPort: Number(process.env.E2E_API_PORT || 5000),
  webPort: Number(process.env.E2E_WEB_PORT || 3000),
  get apiUrl() {
    return `http://localhost:${this.apiPort}`;
  },
  get webUrl() {
    return `http://localhost:${this.webPort}`;
  },
  authDir: `.auth${suffix}`,
  outputDir: `test-results${suffix}`,
  reportDir: `playwright-report${suffix}`,
  clientDistDir: runId ? `.next-e2e${suffix}` : '.next',
};
