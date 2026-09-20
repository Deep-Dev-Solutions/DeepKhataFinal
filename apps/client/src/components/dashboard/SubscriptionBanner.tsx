"use client";

import { useMemo } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WARNING_WINDOW_DAYS = 5;

export default function SubscriptionBanner() {
  const { user, businessSubscription } = useAuth();

  const banner = useMemo(() => {
    if (!user || user.role === "SUPER_ADMIN" || !user.businessId) return null;
    if (!businessSubscription) return null;

    const { status, subscriptionExpiresAt } = businessSubscription;
    const now = new Date();
    const expiresAt = subscriptionExpiresAt
      ? new Date(subscriptionExpiresAt)
      : null;

    // Read-only override or an expired subscription → hard block banner
    if (status === "READ_ONLY" || (expiresAt && expiresAt <= now)) {
      return {
        kind: "expired" as const,
        message:
          "Subscription expired. System is in read-only mode. New sales and edits are disabled.",
      };
    }

    // Warn when the subscription runs out within the next few days
    if (expiresAt) {
      const daysLeft = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / MS_PER_DAY,
      );
      if (daysLeft <= WARNING_WINDOW_DAYS) {
        return {
          kind: "warning" as const,
          message: `Your subscription expires in ${daysLeft} day${
            daysLeft === 1 ? "" : "s"
          }. Please contact administration to renew.`,
        };
      }
    }

    return null;
  }, [user, businessSubscription]);

  if (!banner) return null;

  const isExpired = banner.kind === "expired";

  return (
    <div
      className={`w-full px-4 py-2 text-center text-sm font-semibold flex items-center justify-center gap-2 ${
        isExpired
          ? "bg-red-600 text-white"
          : "bg-amber-500 text-white"
      }`}
      role="alert"
    >
      {isExpired ? (
        <Ban className="w-4 h-4 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      )}
      <span>{banner.message}</span>
    </div>
  );
}