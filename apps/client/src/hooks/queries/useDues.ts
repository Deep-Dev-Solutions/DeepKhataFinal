"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchDues,
  fetchDuesSummary,
  postPromise,
  postReminded,
  recordDuePayment,
  type DueItem,
  type DuesListParams,
} from "@/lib/dues";

const DUES_STALE_MS = 30_000;

export function useDuesSummary(options?: { enabled?: boolean }) {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.dues.summary(activeBranchId),
    queryFn: () => fetchDuesSummary(activeBranchId),
    staleTime: DUES_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

export function useDues(
  params: DuesListParams,
  options?: { enabled?: boolean },
) {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.dues.list(activeBranchId, params),
    queryFn: () => fetchDues(params, activeBranchId),
    staleTime: DUES_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

/** Mutations refresh dues.*, dashboard and notifications (reminders create some). */
function useInvalidateAfterDueChange() {
  const queryClient = useQueryClient();
  const { activeBranchId } = useAuth();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dues.all }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard(activeBranchId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    ]);
}

export function useRecordDuePayment() {
  const { activeBranchId } = useAuth();
  const invalidate = useInvalidateAfterDueChange();
  return useMutation({
    mutationFn: (vars: { item: DueItem; amount: number }) =>
      recordDuePayment(vars.item, vars.amount, activeBranchId),
    onSuccess: invalidate,
  });
}

export function usePostPromise() {
  const { activeBranchId } = useAuth();
  const invalidate = useInvalidateAfterDueChange();
  return useMutation({
    mutationFn: (vars: {
      item: Pick<DueItem, "entityType" | "entityId">;
      body: Parameters<typeof postPromise>[1];
    }) => postPromise(vars.item, vars.body, activeBranchId),
    onSuccess: invalidate,
  });
}

export function usePostReminded() {
  const { activeBranchId } = useAuth();
  const invalidate = useInvalidateAfterDueChange();
  return useMutation({
    mutationFn: (vars: {
      item: Pick<DueItem, "entityType" | "entityId">;
      channel: "WHATSAPP_LINK" | "CALL";
    }) => postReminded(vars.item, vars.channel, activeBranchId),
    onSuccess: invalidate,
  });
}
