import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared page header: title, optional subtitle, right-aligned actions.
 * Forwards className and data-testid via rest props.
 */
export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("mb-4 flex flex-wrap items-start justify-between gap-2", className)}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div data-slot="page-header-actions" className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export default PageHeader;
