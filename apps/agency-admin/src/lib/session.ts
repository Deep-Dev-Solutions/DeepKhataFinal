"use client";

/**
 * App-level session events.
 *
 * `api.ts` dispatches exactly one of these whenever a request comes back 401/403
 * and the re-check of `/user/me` says the browser identity changed underneath us.
 * AuthContext is the only listener; everything else reacts through it.
 */
export type SessionEventType = "session-expired" | "session-switched" | "forbidden";

export interface SessionIdentity {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  businessId?: string | null;
  businessName?: string | null;
}

export interface SessionEventDetail {
  type: SessionEventType;
  /** Who the browser is signed in as now, when the server told us. */
  user?: SessionIdentity;
}

export const SESSION_EVENT = "deepkhata:agency-session";

export function dispatchSessionEvent(detail: SessionEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SessionEventDetail>(SESSION_EVENT, { detail }));
}

export function subscribeToSessionEvents(handler: (detail: SessionEventDetail) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<SessionEventDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(SESSION_EVENT, listener);
  return () => window.removeEventListener(SESSION_EVENT, listener);
}
