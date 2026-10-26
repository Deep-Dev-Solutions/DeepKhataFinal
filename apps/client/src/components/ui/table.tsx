import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared compact table with zebra rows, header, row hover, empty state
 * and a pagination slot. Every part forwards className and data-testid.
 */

function Table({
  className,
  containerClassName,
  zebra = true,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  zebra?: boolean;
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("w-full overflow-x-auto rounded-md border border-border bg-card", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full text-sm", zebra && "dk-zebra", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead data-slot="table-header" className={cn("bg-gray-100", className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-brand-50/60 data-[state=selected]:bg-accent", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 px-2.5 text-left align-middle text-xs font-semibold tracking-wide text-gray-600 uppercase whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-2.5 py-1.5 align-middle text-sm", className)}
      {...props}
    />
  );
}

function TableEmpty({
  colSpan,
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { colSpan: number }) {
  return (
    <tr data-slot="table-empty-row" className="hover:bg-transparent">
      <td
        data-slot="table-empty"
        colSpan={colSpan}
        className={cn("px-4 py-10 text-center text-sm text-muted-foreground", className)}
        {...props}
      >
        {children ?? "Nothing to show."}
      </td>
    </tr>
  );
}

function TablePagination({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="table-pagination"
      className={cn("flex items-center justify-between gap-2 border-t border-border px-2.5 py-2 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TablePagination,
};
