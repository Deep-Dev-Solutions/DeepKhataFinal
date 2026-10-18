"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import type { Customer, FinancialReportData, Product } from "@/types/api";

const REPORTS_STALE_MS = 5 * 60_000;

export interface StaffMetrics {
  name: string;
  revenue?: number;
  orders?: number;
}

export interface InventoryReport {
  topProducts: Product[];
  deadStock: Product[];
}

async function fetchReport<T>(
  path: string,
  branchId: string | null,
  failMessage: string,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: getAuthHeaders(branchId),
  });
  const json = (await res.json()) as T & { success?: boolean; message?: string };
  if (!res.ok || !json?.success) throw new Error(json?.message || failMessage);
  return json;
}

export function useFinancialReport(days: number) {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.financial(activeBranchId, { days }),
    queryFn: () =>
      fetchReport<FinancialReportData>(
        `/reports/financial?days=${days}`,
        activeBranchId,
        "Failed to load financial report",
      ),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useInventoryReport() {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.inventory(activeBranchId),
    queryFn: async (): Promise<InventoryReport> => {
      const json = await fetchReport<{
        topProducts?: Product[];
        deadStock?: Product[];
      }>("/reports/inventory", activeBranchId, "Failed to load inventory report");
      return {
        topProducts: json.topProducts || [],
        deadStock: json.deadStock || [],
      };
    },
    staleTime: REPORTS_STALE_MS,
  });
}

export function useStaffReport() {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.staff(activeBranchId),
    queryFn: async (): Promise<StaffMetrics[]> => {
      const json = await fetchReport<{ staffPerformance?: StaffMetrics[] }>(
        "/reports/staff",
        activeBranchId,
        "Failed to load staff report",
      );
      return json.staffPerformance || [];
    },
    staleTime: REPORTS_STALE_MS,
  });
}

export function useCustomerReport() {
  const { activeBranchId } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.customers(activeBranchId),
    queryFn: async (): Promise<Customer[]> => {
      const json = await fetchReport<{ vipCustomers?: Customer[] }>(
        "/reports/customers",
        activeBranchId,
        "Failed to load customer report",
      );
      return json.vipCustomers || [];
    },
    staleTime: REPORTS_STALE_MS,
  });
}
