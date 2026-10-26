import * as React from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared toast card, styled from the semantic tokens. Presentational:
 * ToastContext owns the queue and renders one of these per item.
 * Keeps the long-standing data-testid="toast" + data-type contract.
 */
export type ToastVariant = "success" | "error" | "warning" | "info";

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-success/40 bg-success-bg text-success-fg",
  error: "border-danger/40 bg-danger-bg text-danger-fg",
  warning: "border-warning/50 bg-warning-bg text-warning-fg",
  info: "border-border bg-white text-foreground",
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 shrink-0 text-success" />,
  error: <AlertCircle className="size-4 shrink-0 text-danger" />,
  warning: <AlertTriangle className="size-4 shrink-0 text-warning" />,
  info: <Info className="size-4 shrink-0 text-primary" />,
};

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant;
  message: React.ReactNode;
  onDismiss?: () => void;
}

export function Toast({
  variant = "info",
  message,
  onDismiss,
  className,
  ...props
}: ToastProps) {
  return (
    <div
      role="alert"
      data-testid="toast"
      data-type={variant}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-md border px-3 py-2.5 shadow-md",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {VARIANT_ICONS[variant]}
      <div className="flex-1 text-sm leading-snug font-medium break-words">
        {message}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="-m-0.5 cursor-pointer rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default Toast;
