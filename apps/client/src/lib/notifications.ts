import { API_BASE_URL, getAuthHeaders } from "./auth";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.message === "string") return data.message;
  } catch {
    // ignore body parse errors
  }
  return `Request failed (${res.status})`;
}

export async function fetchNotifications(
  branchId: string | null,
  limit = 10,
): Promise<NotificationsResponse> {
  const res = await fetch(`${API_BASE_URL}/notifications?limit=${limit}`, {
    credentials: "include",
    headers: getAuthHeaders(branchId),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as NotificationsResponse;
}

export async function markNotificationsRead(
  branchId: string | null,
  body: { ids?: string[]; all?: boolean },
): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE_URL}/notifications/read`, {
    credentials: "include",
    method: "POST",
    headers: getAuthHeaders(branchId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { updated: number };
}
