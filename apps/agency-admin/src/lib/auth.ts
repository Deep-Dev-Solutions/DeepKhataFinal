export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
export const CLIENT_APP_URL =
  process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000";

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
  } catch {}
}

/** fetch() that always sends the session cookie to the API. */
export function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}

export const getAuthHeaders = () => ({
  "Content-Type": "application/json",
});
