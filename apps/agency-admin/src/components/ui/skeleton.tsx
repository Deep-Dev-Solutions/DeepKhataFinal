import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared loading skeleton. Defaults to a one-line block; size via className.
 * Forwards className and data-testid via rest props.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("h-4 w-full animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  );
}

export default Skeleton;
