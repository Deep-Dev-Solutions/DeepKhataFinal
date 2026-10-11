import { JwtService } from '@nestjs/jwt';
import { getAccessTokenSecret } from '../../src/auth/jwt-secrets.js';
import { users, tenants } from '../../../e2e/fixtures/users';

export { users, tenants };

export type TestUserKey = 'superAdmin' | 'ownerA' | 'managerA' | 'staffA' | 'ownerB';

const jwt = new JwtService({});

function businessIdFor(tenant: 'A' | 'B' | null): string | null {
  return tenant ? tenants[tenant].id : null;
}

/** Signs an access token directly with the real payload shape; no HTTP login. */
export function tokenFor(user: TestUserKey): string {
  const u = users[user];
  return jwt.sign(
    {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      businessId: businessIdFor(u.tenant),
    },
    { secret: getAccessTokenSecret(), expiresIn: '1h' },
  );
}

export function authHeader(user: TestUserKey, branchId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${tokenFor(user)}`,
    ...(branchId ? { 'x-branch-id': branchId } : {}),
  };
}
