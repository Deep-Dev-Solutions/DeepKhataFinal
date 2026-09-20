export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const AGENCY_APP_URL =
  process.env.NEXT_PUBLIC_AGENCY_URL || "http://localhost:3001";

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"),
  );
  return match ? decodeURIComponent(match[3]) : null;
}

export function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function decodeJwt<T = any>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = decodeJwt<{ exp?: number }>(token);
  if (!payload) return false;
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    return false;
  }
  return true;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const cookieToken = getCookie("accessToken");
  if (cookieToken && isTokenValid(cookieToken)) {
    return cookieToken;
  }
  const localToken = localStorage.getItem("accessToken");
  if (localToken && isTokenValid(localToken)) {
    // Sync to cookie so Next.js middleware and server requests have it
    setCookie("accessToken", localToken);
    return localToken;
  }
  return null;
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("accessToken", token);
  setCookie("accessToken", token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  deleteCookie("accessToken");
}

export const getAuthHeaders = () => {
  const accessToken = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
};
