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
