import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export interface SyncRequestInit extends RequestInit {
  /** Overrides the active branch (sent as x-branch-id). */
  branchId?: string | null;
}

export class SyncHttpError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Server responded with ${status}`);
    this.name = "SyncHttpError";
    this.status = status;
  }
}

/** Same lookup the rest of the app uses: `activeBranch_<businessId>` of the stored user. */
export function getActiveBranchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user?.businessId) {
      return localStorage.getItem(`activeBranch_${user.businessId}`);
    }
  } catch {
    // corrupt localStorage entry: behave as "no branch"
  }
  return null;
}

/** True when there is anything to authenticate with (token now, cookie session later). */
export function hasSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      localStorage.getItem("accessToken") || localStorage.getItem("user"),
    );
  } catch {
    return false;
  }
}

/**
 * The ONE place every sync request goes through. Bearer headers today, cookie
 * session tomorrow: both are sent (`credentials: 'include'`).
 */
export function syncFetch(
  path: string,
  init: SyncRequestInit = {},
): Promise<Response> {
  const { branchId, headers: extra, ...rest } = init;
  const headers = new Headers(getAuthHeaders(branchId ?? null));
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: "include",
  });
}
