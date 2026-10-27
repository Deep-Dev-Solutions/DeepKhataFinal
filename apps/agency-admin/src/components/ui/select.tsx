import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared select — native <select> with a token-styled skin and chevron.
 * Forwards className and any data-testid to the <select> element.
 */
export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md";
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = "md", children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "w-full cursor-pointer appearance-none rounded-md border border-input bg-white pr-7 pl-2.5 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 aria-invalid:border-danger",
          size === "sm"
            ? "h-[var(--control-sm)]"
            : "h-[var(--control-md)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
export default Select;
