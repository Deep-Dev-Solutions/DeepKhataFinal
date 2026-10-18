"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchNotifications,
  markNotificationsRead,
  type NotificationsResponse,
} from "@/lib/notifications";

const NOTIFICATIONS_STALE_MS = 30_000;
const POLL_MS = 60_000;

/** Latest notifications (also carries unreadCount). Polls every 60 s while the tab is visible. */
export function useNotifications(limit = 10) {
  const { activeBranchId, token } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications.list(activeBranchId),
    queryFn: () => fetchNotifications(activeBranchId, limit),
    staleTime: NOTIFICATIONS_STALE_MS,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    enabled: !!token,
  });
}

/** Unread badge count only (fetches a single item and reads unreadCount). */
export function useUnreadCount() {
  const { activeBranchId, token } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications.unread(activeBranchId),
    queryFn: () => fetchNotifications(activeBranchId, 1),
    select: (data: NotificationsResponse) => data.unreadCount,
    staleTime: NOTIFICATIONS_STALE_MS,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    enabled: !!token,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const { activeBranchId } = useAuth();
  return useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) =>
      markNotificationsRead(activeBranchId, body),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
