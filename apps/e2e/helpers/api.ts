import type { APIRequestContext } from '@playwright/test';
import { TEST_PASSWORD, users, type RoleKey } from '../fixtures/users';

import { E2E } from '../env';

const API_URL = E2E.apiUrl;
const tokens = new Map<string, string>();

export interface ApiOpts {
  branchId?: string;
}

async function tokenFor(user: RoleKey, request: APIRequestContext): Promise<string> {
  const cached = tokens.get(user);
  if (cached) return cached;
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: users[user].email, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${user}: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.accessToken) throw new Error(`API login for ${user} returned no accessToken`);
  tokens.set(user, body.accessToken);
  return body.accessToken;
}

export async function apiAs(user: RoleKey, request: APIRequestContext) {
  const token = await tokenFor(user, request);
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete') =>
    (path: string, body?: unknown, opts: ApiOpts = {}) =>
      request[method](`${API_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.branchId ? { 'x-branch-id': opts.branchId } : {}),
        },
        ...(body !== undefined ? { data: body } : {}),
      });
  return {
    get: call('get'),
    post: call('post'),
    patch: call('patch'),
    put: call('put'),
    delete: call('delete'),
  };
}
