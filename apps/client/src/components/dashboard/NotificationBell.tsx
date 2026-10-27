"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/hooks/queries/useNotifications";
import { queryKeys } from "@/lib/query-keys";
import type {
  AppNotification,
  NotificationsResponse,
} from "@/lib/notifications";

const NO_ITEMS: AppNotification[] = [];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const { activeBranchId } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Polls every 60 s (paused while the tab is hidden); refetches on tab focus.
  const { data, refetch } = useNotifications(10);
  const markRead = useMarkNotificationsRead();
  const items = data?.items ?? NO_ITEMS;
  const unreadCount = data?.unreadCount ?? 0;

  const listKey = queryKeys.notifications.list(activeBranchId);

  /** Optimistically patch the cached list; markRead settles by invalidating. */
  const patchCache = (
    update: (prev: NotificationsResponse) => NotificationsResponse,
  ) => {
    queryClient.setQueryData<NotificationsResponse>(listKey, (prev) =>
      prev ? update(prev) : prev,
    );
  };

  // Click outside / Escape closes dropdown
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) void refetch();
  };

  const handleItemClick = async (n: AppNotification) => {
    const wasUnread = !n.readAt;
    if (wasUnread) {
      const stamp = new Date().toISOString();
      patchCache((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          i.id === n.id ? { ...i, readAt: stamp } : i,
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));
    }
    if (n.link) {
      setIsOpen(false);
      router.push(n.link);
    }
    if (wasUnread) {
      try {
        await markRead.mutateAsync({ ids: [n.id] });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not mark as read",
        );
      }
    }
  };

  const handleMarkAll = async () => {
    const stamp = new Date().toISOString();
    patchCache((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.readAt ? i : { ...i, readAt: stamp })),
      unreadCount: 0,
    }));
    try {
      await markRead.mutateAsync({ all: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark all as read",
      );
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        data-testid="notif-bell"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={toggle}
        className={`relative rounded-full p-2 transition-colors ${isOpen ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-100"}`}
      >
        <Bell className="w-5 h-5 pointer-events-none" />
        {unreadCount > 0 && (
          <span
            data-testid="notif-count"
            className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 flex items-center justify-center rounded-full bg-danger text-white text-caption font-bold ring-2 ring-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="notif-dropdown"
          className="absolute right-0 mt-3 w-[320px] sm:w-[380px] bg-card rounded-lg shadow-overlay border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 z-50"
        >
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-caption font-semibold text-brand-700">
                  {unreadCount} New
                </span>
              )}
            </h3>
            <button
              type="button"
              data-testid="notif-mark-all"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div
                data-testid="notif-empty"
                className="p-8 text-center text-sm text-gray-500"
              >
                No notifications yet
              </div>
            ) : (
              items.map((n) => {
                const unread = !n.readAt;
                return (
                  <button
                    key={n.id}
                    type="button"
                    data-testid="notif-item"
                    data-unread={unread ? "true" : "false"}
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors flex gap-3 ${unread ? "bg-brand-50/40" : ""}`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-brand-700" : "bg-transparent"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm text-gray-900 ${unread ? "font-bold" : "font-medium"}`}
                      >
                        {n.title}
                      </span>
                      <span className="block text-xs text-gray-600 line-clamp-2">
                        {n.body}
                      </span>
                      <span className="block mt-1 text-caption text-gray-400">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
