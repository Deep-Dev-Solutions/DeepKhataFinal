import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Shared badge. Variants map to the semantic tokens:
 * neutral, brand, success (money in / positive), warning, danger (money out /
 * negative), outline. Forwards className and data-testid via rest props.
 */
const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border bg-gray-100 text-gray-700",
        brand: "border-brand-200 bg-brand-50 text-brand-800",
        success: "border-success/30 bg-success-bg text-success-fg",
        warning: "border-warning/30 bg-warning-bg text-warning-fg",
        danger: "border-danger/30 bg-danger-bg text-danger-fg",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { badgeVariants };
export default Badge;
