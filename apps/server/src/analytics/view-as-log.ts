import type { PrismaClient } from '@prisma/client';

/** Action recorded for the single start-of-visit row (written by the agency endpoint). */
export const VIEW_AS_ACTION = 'VIEW_AS';
/** Action for the first read of each (method, route template) during a view-as session. */
export const SUPPORT_READ_ACTION = 'SUPPORT_READ';
/** Action for a write that the read-only guard refused during a view-as session. */
export const SUPPORT_WRITE_BLOCKED_ACTION = 'SUPPORT_WRITE_BLOCKED';

const MAX_SESSIONS = 1_000;
const MAX_KEYS_PER_SESSION = 300;
const MAX_BLOCKED_PER_SESSION = 200;

/** session token -> "METHOD template" keys already logged. Safe to lose (worst case: one more row). */
const seen = new Map<string, Set<string>>();
const blockedCount = new Map<string, number>();

function evictOldest<V>(m: Map<string, V>) {
  while (m.size > MAX_SESSIONS) {
    const first = m.keys().next().value;
    if (first === undefined) break;
    m.delete(first);
  }
}

/** Background/self routes of an impersonated session are never logged. */
export function isUnloggedSelfRoute(path: string): boolean {
  return path.startsWith('/auth/') || path === '/user/me' || path === '/health';
}

/** Express route template (`/customer/:id`), falling back to the concrete path. */
export function routeTemplate(req: any): string {
  const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
  const tpl = req.route?.path;
  if (typeof tpl === 'string' && tpl.length > 0) {
    const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    return `${base}${tpl}` || path;
  }
  return path;
}

/** True the first time this session hits this method + route template. */
export function firstHitInSession(sessionToken: string, method: string, template: string): boolean {
  let keys = seen.get(sessionToken);
  if (!keys) {
    keys = new Set();
    seen.set(sessionToken, keys);
    evictOldest(seen);
  }
  const key = `${method} ${template}`;
  if (keys.has(key)) return false;
  if (keys.size >= MAX_KEYS_PER_SESSION) return false;
  keys.add(key);
  return true;
}

/**
 * Called by SessionGuard when a view-as session attempts a write. Guards run
 * before interceptors, so the interceptor never sees these requests. Never throws.
 */
export function logBlockedViewAsWrite(
  db: PrismaClient,
  req: any,
  session: { token?: string; impersonatedBy?: string | null },
  businessId: string | null,
): void {
  if (!session.impersonatedBy || !businessId) return;
  const token = session.token ?? '';
  const n = blockedCount.get(token) ?? 0;
  if (n >= MAX_BLOCKED_PER_SESSION) return;
  blockedCount.set(token, n + 1);
  evictOldest(blockedCount);
  void db.adminAccessLog
    .create({
      data: {
        adminId: session.impersonatedBy,
        businessId,
        action: SUPPORT_WRITE_BLOCKED_ACTION,
        route: routeTemplate(req),
        method: String(req.method),
      },
    })
    .catch(() => {});
}
