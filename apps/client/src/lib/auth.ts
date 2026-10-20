export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const AGENCY_APP_URL =
  process.env.NEXT_PUBLIC_AGENCY_URL || "http://localhost:3001";

/**
 * Authentication is a Better Auth session cookie (httpOnly, set by the API).
 * No token is ever stored in localStorage or a JS-readable cookie.
 */

/** Removes tokens left behind by the pre-cookie login flow. */
export function clearLegacyAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("accessToken");
    document.cookie =
      "accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  } catch {}
}

/** Clears legacy tokens plus the cached profile (used on logout / 401). */
export function clearAuthStorage() {
  if (typeof window === "undefined") return;
  clearLegacyAuthStorage();
  try {
    localStorage.removeItem("user");
    localStorage.removeItem("businessSubscription");
  } catch {}
}

/**
 * fetch() that always sends the session cookie to the API.
 * Use this (or add `credentials: "include"`) for every API call.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}

export const getAuthHeaders = (selectedBranchId?: string | null) => {
  let branchId = selectedBranchId || null;

  if (!branchId && typeof window !== "undefined") {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      if (user?.businessId) {
        branchId = localStorage.getItem(`activeBranch_${user.businessId}`);
      }
    } catch {}
  }

  return {
    "Content-Type": "application/json",
    ...(branchId ? { "x-branch-id": branchId } : {}),
  };
};
