import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared text input. Compact (36px), token colours.
 * Forwards className and any data-testid via rest props.
 */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "md", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-white px-2.5 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20",
        size === "sm" ? "h-[var(--control-sm)] py-0.5" : "h-[var(--control-md)] py-1",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
export default Input;
