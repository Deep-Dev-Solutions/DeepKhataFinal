"use client";

import { useAuth } from "@/context/AuthContext";

/**
 * Returns true when the tenant business is in a read-only state
 * (READ_ONLY / SUSPENDED / subscription expired), in which case all
 * write actions (orders, restocks, new products, deletes, setting edits)
 * must be disabled client-side.
 */
export function useIsReadOnly(): boolean {
  const { isReadOnly } = useAuth();
  return isReadOnly;
}