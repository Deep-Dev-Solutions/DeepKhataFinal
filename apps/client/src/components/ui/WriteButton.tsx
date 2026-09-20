"use client";

import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "success" | "danger" | "ghost";

type WriteButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  title?: string;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm",
  success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
  danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
  ghost:
    "bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-200",
};

const SIZE_CLASSES: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-xl",
};

export default function WriteButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
  size = "md",
  title,
}: WriteButtonProps) {
  const readOnly = useIsReadOnly();

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || readOnly}
      title={
        readOnly
          ? "Subscription expired. System is in read-only mode."
          : title
      }
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-60 ${
        readOnly ? "cursor-not-allowed bg-slate-400" : VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${className}`}
    >
      {readOnly && <Lock className="w-4 h-4" />}
      {readOnly ? "Read-only" : children}
    </button>
  );
}