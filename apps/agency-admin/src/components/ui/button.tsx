"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Shared button. Variants: primary, secondary, ghost, danger (plus link).
 * Sizes: sm (28px), md (36px, default), lg (44px — POS checkout only), icon.
 * `loading` renders a spinner and disables the button.
 * Forwards className and any data-testid via rest props.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-brand-800",
        secondary:
          "border-border bg-white text-foreground hover:bg-gray-100",
        ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90",
        link: "bg-transparent text-primary underline-offset-4 hover:underline",
        // legacy aliases (kept so older variant names keep compiling)
        default: "bg-primary text-primary-foreground hover:bg-brand-800",
        outline: "border-border bg-white text-foreground hover:bg-gray-100",
        destructive: "bg-danger text-danger-foreground hover:bg-danger/90",
      },
      size: {
        sm: "h-[var(--control-sm)] px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-[var(--control-md)] px-3.5",
        lg: "h-[var(--control-lg)] px-6 text-base font-semibold",
        icon: "size-[var(--control-md)]",
        "icon-sm": "size-[var(--control-sm)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
export default Button;
