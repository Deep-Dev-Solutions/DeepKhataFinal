import { API_BASE_URL } from "@/lib/auth";
import { dispatchSessionEvent, type SessionIdentity } from "@/lib/session";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type JsonValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

interface ApiOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: JsonValue | FormData;
  headers?: HeadersInit;
}

function buildHeaders(extra?: HeadersInit): Headers {
  // Auth is the httpOnly session cookie (credentials: "include" below).
  return new Headers(extra ?? {});
}

function isFormData(value: JsonValue | FormData): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

/** 401/403 are the only statuses that can mean "this browser is someone else now". */
function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * `/user/me` and the view-as endpoints are the probes themselves - re-checking
 * inside them would recurse.
 */
function shouldRecheckIdentity(path: string): boolean {
  return !path.startsWith("/user/me") && !path.startsWith("/auth/");
}

let identityRecheck: Promise<void> | null = null;

/**
 * Single-flight re-check: one `/user/me` per burst of auth failures, then exactly
 * one app event. 401/no-session means the cookie is gone, a non-SUPER_ADMIN role
 * means another tab signed in as somebody else, and SUPER_ADMIN means the caller
 * really is forbidden and should render its own error.
 */
function recheckIdentity(): Promise<void> {
  if (identityRecheck) return identityRecheck;

  identityRecheck = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/user/me`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        dispatchSessionEvent({ type: "session-expired" });
        return;
      }

      let identity: SessionIdentity | null = null;
      try {
        identity = (await res.json()) as SessionIdentity;
      } catch {
        identity = null;
      }

      if (identity && identity.role !== "SUPER_ADMIN") {
        dispatchSessionEvent({ type: "session-switched", user: identity });
        return;
      }

      dispatchSessionEvent({ type: "forbidden" });
    } catch {
      dispatchSessionEvent({ type: "session-expired" });
    } finally {
      identityRecheck = null;
    }
  })();

  return identityRecheck;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { body, headers: extraHeaders, method, ...rest } = options;
  const headers = buildHeaders(extraHeaders);
  const requestBody = buildBody(body);

  if (body !== undefined && body !== null) {
    if (isFormData(body)) {
      headers.delete("Content-Type");
    } else if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method,
    credentials: "include",
    headers,
    body: requestBody,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.message === "string") {
        message = data.message;
      }
    } catch {
      message = res.statusText || message;
    }
    if (isAuthFailure(res.status) && shouldRecheckIdentity(path)) {
      // Fire and forget: the caller still throws so its own error state renders.
      void recheckIdentity();
    }

    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function buildBody(body?: JsonValue | FormData): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (isFormData(body)) return body;
  return JSON.stringify(body);
}

export const api = {
  get: <T = unknown>(path: string, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(
    path: string,
    body?: JsonValue | FormData,
    options?: ApiOptions,
  ) => apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T = unknown>(
    path: string,
    body?: JsonValue | FormData,
    options?: ApiOptions,
  ) => apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T = unknown>(
    path: string,
    body?: JsonValue | FormData,
    options?: ApiOptions,
  ) => apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T = unknown>(path: string, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};