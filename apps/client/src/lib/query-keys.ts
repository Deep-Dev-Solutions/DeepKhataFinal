import type { DuesListParams } from "@/lib/dues";

type BranchId = string | null | undefined;

const branch = (branchId: BranchId) => branchId ?? null;

/**
 * Central TanStack Query keys. Every key carries the active branchId so a
 * branch switch never serves another branch's cached data.
 */
export const queryKeys = {
  dues: {
    all: ["dues"] as const,
    summary: (branchId: BranchId) =>
      ["dues", "summary", branch(branchId)] as const,
    list: (branchId: BranchId, params: DuesListParams) =>
      ["dues", "list", branch(branchId), params] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (branchId: BranchId) =>
      ["notifications", "list", branch(branchId)] as const,
    unread: (branchId: BranchId) =>
      ["notifications", "unread", branch(branchId)] as const,
  },
  plan: {
    all: ["plan"] as const,
    usage: (branchId: BranchId) => ["plan", "usage", branch(branchId)] as const,
    checklist: (branchId: BranchId) =>
      ["plan", "checklist", branch(branchId)] as const,
  },
  dashboard: (branchId: BranchId) => ["dashboard", branch(branchId)] as const,
  reports: {
    all: ["reports"] as const,
    financial: (branchId: BranchId, params: { days: number }) =>
      ["reports", "financial", branch(branchId), params] as const,
    inventory: (branchId: BranchId, params: Record<string, never> = {}) =>
      ["reports", "inventory", branch(branchId), params] as const,
    staff: (branchId: BranchId, params: Record<string, never> = {}) =>
      ["reports", "staff", branch(branchId), params] as const,
    customers: (branchId: BranchId, params: Record<string, never> = {}) =>
      ["reports", "customers", branch(branchId), params] as const,
  },
};
