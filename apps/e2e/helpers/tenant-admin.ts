import { expect, type APIRequestContext } from '@playwright/test';
import { E2E } from '../env';
import { TEST_PASSWORD, users } from '../fixtures/users';
import { db } from './db';

/**
 * Throw-away tenants for suites that change a business's status or plan limits.
 * They are created through the agency API (which also invalidates the server's tenant cache),
 * so tenant A / B are never touched.
 */

export type BizStatus = 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';

async function superAdminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${E2E.apiUrl}/auth/login`, {
    data: { email: users.superAdmin.email, password: TEST_PASSWORD },
  });
  expect(res.ok(), `super admin login failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).accessToken as string;
}

export interface ThrowawayTenant {
  businessId: string;
  ownerEmail: string;
  ownerId: string;
  branchId: string;
}

let n = 0;
export async function createThrowawayTenant(request: APIRequestContext, label: string): Promise<ThrowawayTenant> {
  n += 1;
  const token = `${Date.now().toString(36)}${n}${Math.floor(Math.random() * 1296).toString(36)}`;
  const ownerEmail = `e2e-${label}-${token}@deepkhata.test`.toLowerCase();
  const sa = await superAdminToken(request);
  const res = await request.post(`${E2E.apiUrl}/agency/onboard-tenant`, {
    headers: { Authorization: `Bearer ${sa}` },
    data: {
      businessName: `E2E ${label} ${token}`,
      ownerName: `Owner ${token}`,
      ownerEmail,
      ownerPassword: TEST_PASSWORD,
      customLimits: { maxBranches: 2, maxUsers: 5, maxProducts: null },
    },
  });
  expect(res.ok(), `onboard-tenant failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const branch = await db.branch.findFirstOrThrow({ where: { businessId: body.business.id } });
  return { businessId: body.business.id, ownerEmail, ownerId: body.owner.id, branchId: branch.id };
}

/** Changes status through the agency API so the server's in-memory tenant cache is invalidated. */
export async function setBusinessStatus(
  request: APIRequestContext,
  businessId: string,
  status: BizStatus,
): Promise<void> {
  const sa = await superAdminToken(request);
  const res = await request.patch(`${E2E.apiUrl}/agency/tenants/${businessId}/status`, {
    headers: { Authorization: `Bearer ${sa}` },
    data: { status },
  });
  expect(res.ok(), `status change failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/** Logs in as the throw-away tenant owner and returns an API client. */
export async function loginApi(request: APIRequestContext, email: string) {
  const res = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email, password: TEST_PASSWORD } });
  return res;
}

export async function apiWithToken(request: APIRequestContext, accessToken: string) {
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete') =>
    (path: string, body?: unknown, branchId?: string) =>
      request[method](`${E2E.apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, ...(branchId ? { 'x-branch-id': branchId } : {}) },
        ...(body !== undefined ? { data: body } : {}),
      });
  return { get: call('get'), post: call('post'), patch: call('patch'), put: call('put'), delete: call('delete') };
}
