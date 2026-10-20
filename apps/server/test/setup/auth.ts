import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { users, tenants } from '../../../e2e/fixtures/users';

export { users, tenants };

export type TestUserKey = 'superAdmin' | 'ownerA' | 'managerA' | 'staffA' | 'ownerB';

/**
 * global-setup.ts seeds one Better Auth session per test user with this
 * token. The bearer plugin signs a raw token itself, so it works as
 * `Authorization: Bearer <token>`; no HTTP login is needed.
 */
export function sessionTokenFor(user: TestUserKey): string {
  return `test-session-${user}`;
}

export function tokenFor(user: TestUserKey): string {
  return sessionTokenFor(user);
}

export function authHeader(user: TestUserKey, branchId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${tokenFor(user)}`,
    ...(branchId ? { 'x-branch-id': branchId } : {}),
  };
}

/**
 * Inserts a brand-new Session row for `userId` and returns its bearer token.
 * Use this for tests that revoke a session (logout), so the shared seeded
 * token of the user stays valid for the rest of the suite.
 */
export async function freshSessionToken(prisma: PrismaClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId,
      expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
      createdAt: now,
      updatedAt: now,
    },
  });
  return token;
}
