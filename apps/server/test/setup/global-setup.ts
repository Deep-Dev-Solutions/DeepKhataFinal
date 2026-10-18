import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.join(serverRoot, '.env') });

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST must be set in apps/server/.env');
  }
  const host = new URL(testUrl).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to reset a non-local test database (host: ${host}). DATABASE_URL_TEST must point at localhost or 127.0.0.1.`,
    );
  }

  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    DIRECT_URL: testUrl,
  };

  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: serverRoot,
    env,
    stdio: 'inherit',
  });
  execSync('npx prisma db seed', { cwd: serverRoot, env, stdio: 'inherit' });
}
