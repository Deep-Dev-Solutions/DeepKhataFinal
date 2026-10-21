import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(serverRoot, '.env') });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST must be set in apps/server/.env');
}

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.DIRECT_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-0123456789abcdef-0123456789';
process.env.BETTER_AUTH_URL = 'http://localhost:5000';
// The suite hits many routes from a single IP; the throttlers get their real
// (low) limits only in hardening.e2e-spec.ts, which sets its own env first.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_PUBLIC_LIMIT = '100000';
