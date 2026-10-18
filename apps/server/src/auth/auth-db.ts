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

type WriteArgs = { data?: Record<string, unknown> } | undefined;

/**
 * Better Auth stamps `updatedAt` on every user write, but User has no such
 * column; drop it so verify-email and admin plugin updates do not fail.
 */
function stripUpdatedAt(args: WriteArgs): WriteArgs {
  if (!args?.data || !('updatedAt' in args.data)) return args;
  const { updatedAt: _ignored, ...data } = args.data;
  return { ...args, data };
}

const USER_WRITES = new Set(['create', 'update', 'updateMany']);

/** Wraps a client (or transaction client) so user writes lose `updatedAt`. */
function wrapClient<T extends object>(db: T): T {
  return new Proxy(db, {
    get(target, prop) {
      const value = (target as any)[prop];
      if (prop === 'user') {
        return new Proxy(value, {
          get(delegate, method) {
            const fn = delegate[method];
            if (typeof method === 'string' && USER_WRITES.has(method)) {
              return (args: WriteArgs) => fn.call(delegate, stripUpdatedAt(args));
            }
            return typeof fn === 'function' ? fn.bind(delegate) : fn;
          },
        });
      }
      if (prop === '$transaction' && typeof value === 'function') {
        return (arg: unknown, ...rest: unknown[]) =>
          typeof arg === 'function'
            ? value.call(target, (tx: object) => arg(wrapClient(tx)), ...rest)
            : value.call(target, arg, ...rest);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Lazy stand-in handed to the Better Auth prisma adapter. */
export const authDbProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // The adapter peeks at the client's data model while Better Auth is being
    // constructed, before Nest has bound the real client; report "none".
    if (!client && prop === '_runtimeDataModel') return undefined;
    const db = wrapClient(authDb()) as any;
    const value = db[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
  has(_target, prop) {
    return prop in (authDb() as any);
  },
});
