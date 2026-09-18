"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

export const ROLE_PERMISSIONS = {
  OWNER: [
    "read:products",
    "write:products",
    "delete:products",
    "create:order",
    "read:orders",
    "update:order",
    "read:customers",
    "write:customers",
    "manage:risk",
    "read:reports",
    "manage:team",
    "manage:business",
  ],
  MANAGER: [
    "read:products",
    "write:products",
    "create:order",
    "read:orders",
    "update:order",
    "read:customers",
    "write:customers",
    "manage:risk",
    "read:reports",
  ],
  STAFF: [
    "read:products",
    "create:order",
    "read:orders",
    "update:order",
    "read:customers",
    "write:customers",
  ],
};

type Role = keyof typeof ROLE_PERMISSIONS;

export function usePermissions() {
  const { role: authRole, isLoading } = useAuth();

  const role = useMemo(() => {
    if (!authRole) return null;
    const normalized = authRole.toUpperCase() as Role;
    return normalized in ROLE_PERMISSIONS ? normalized : null;
  }, [authRole]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
    },
    [role],
  );

  return { role, isLoading, hasPermission };
}
