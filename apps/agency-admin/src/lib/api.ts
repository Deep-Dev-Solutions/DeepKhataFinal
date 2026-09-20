import { API_BASE_URL, getAuthToken } from "@/lib/auth";

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
  const headers = new Headers(extra ?? {});
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function isFormData(value: JsonValue | FormData): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
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