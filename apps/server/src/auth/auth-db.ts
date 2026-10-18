import type { PrismaClient } from '@prisma/client';

/**
 * Better Auth is a module-level singleton, but the Prisma client belongs to
 * Nest's DI container. The Nest PrismaService is bound here at boot so the
 * auth instance, its hooks and the guard share one connection pool.
 */
let client: PrismaClient | null = null;

export function bindAuthDb(db: PrismaClient): void {
  client = db;
}

export function authDb(): PrismaClient {
  if (!client) {
    throw new Error('Auth database is not bound yet (AuthModule not booted)');
  }
  return client;
}

/** Lazy stand-in handed to the Better Auth prisma adapter. */
export const authDbProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // The adapter peeks at the client's data model while Better Auth is being
    // constructed, before Nest has bound the real client; report "none".
    if (!client && prop === '_runtimeDataModel') return undefined;
    const db = authDb() as any;
    const value = db[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
  has(_target, prop) {
    return prop in (authDb() as any);
  },
});
