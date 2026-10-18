import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { users } from '../../../e2e/fixtures/users';

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

  // One long-lived Better Auth session per test user; tokenFor() in
  // test/setup/auth.ts returns the matching `test-session-<key>` token.
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    for (const [key, user] of Object.entries(users)) {
      await prisma.session.create({
        data: {
          id: randomUUID(),
          token: `test-session-${key}`,
          userId: user.id,
          expiresAt,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
