"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Convenience modal built on the existing Base UI dialog primitives.
 * Controlled via `open` / `onOpenChange`. Forwards className and data-testid.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children?: React.ReactNode;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = "md",
  className,
  children,
  ...props
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={props["data-testid"]}
        className={cn("gap-0 overflow-hidden p-0", SIZE_CLASSES[size], className)}
      >
        {(title || description) && (
          <DialogHeader className="px-5 py-4">
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        )}
        <div data-slot="modal-body" className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? <DialogFooter className="px-5 py-3">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export default Modal;
