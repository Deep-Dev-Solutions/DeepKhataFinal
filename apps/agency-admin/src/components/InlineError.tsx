"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Inline failure state for one area of the console.
 *
 * Areas that fail must say so and offer a retry; they must never fall through to
 * their empty state, because "no rows" and "the request was rejected" are different
 * facts. Test ids follow `<area>-error` / `<area>-retry`.
 */
export default function InlineError({
  area,
  message,
  onRetry,
  retrying = false,
  compact = false,
}: {
  area: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      data-testid={`${area}-error`}
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger bg-danger-bg text-danger ${
        compact ? "px-3 py-2" : "p-4"
      } text-body font-medium`}
    >
      <span className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          data-testid={`${area}-retry`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger bg-card px-2.5 py-1 text-caption font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-60"
        >
          <RefreshCw size={12} className={retrying ? "animate-spin" : undefined} />
          Retry
        </button>
      )}
    </div>
  );
}
