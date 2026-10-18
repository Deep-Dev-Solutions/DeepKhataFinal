"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import {
  dismissChecklist,
  fetchChecklist,
  fetchPlanUsage,
  wipeSampleData,
} from "@/lib/billing";

const STALE_MS = 30_000;

export function usePlanUsage(options?: { enabled?: boolean }) {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.plan.usage(activeBranchId),
    queryFn: () => fetchPlanUsage(activeBranchId),
    staleTime: STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

export function useChecklist(options?: { enabled?: boolean }) {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.plan.checklist(activeBranchId),
    queryFn: () => fetchChecklist(activeBranchId),
    staleTime: STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

export function useDismissChecklist() {
  const { activeBranchId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dismissChecklist(activeBranchId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.plan.all }),
  });
}

export function useWipeSampleData() {
  const { activeBranchId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => wipeSampleData(activeBranchId),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
