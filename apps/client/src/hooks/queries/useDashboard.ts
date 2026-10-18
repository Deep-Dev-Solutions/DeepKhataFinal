"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/lib/query-keys";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DashboardData = Record<string, any>;

const DASHBOARD_STALE_MS = 5 * 60_000;

async function fetchDashboard(branchId: string | null): Promise<DashboardData> {
  const res = await fetch(`${API_BASE_URL}/dashboard/dashboarddata`, {
    headers: getAuthHeaders(branchId),
    cache: "no-store",
  });
  let data: DashboardData | null = null;
  try {
    data = (await res.json()) as DashboardData;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.message || "Failed to load dashboard data");
  return data ?? {};
}

export function useDashboard() {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.dashboard(activeBranchId),
    queryFn: () => fetchDashboard(activeBranchId),
    staleTime: DASHBOARD_STALE_MS,
  });
}
