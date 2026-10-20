"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  API_BASE_URL,
  AGENCY_APP_URL,
  getAuthHeaders,
  apiFetch,
  clearAuthStorage,
  clearLegacyAuthStorage,
} from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

export interface UserSession {
  id: string;
  name?: string;
  email?: string;
  role: "OWNER" | "STAFF" | string;
  businessId?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
}

export interface BusinessSubscription {
  status?: string;
  subscriptionExpiresAt?: string | null;
}

export interface Branch {
  id: string;
  name: string;
  location?: string | null;
  createdAt?: string;
}

interface AuthContextType {
  user: UserSession | null;
  role: "OWNER" | "STAFF" | string | null;
  /**
   * In-memory session token (never persisted). Only kept for legacy callers that
   * still gate on it or send it as a Bearer; the real credential is the
   * httpOnly session cookie.
   */
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Subscription / billing state for the tenant's business
  businessSubscription: BusinessSubscription | null;
  // True when the tenant business is read-only (READ_ONLY / SUSPENDED / expired)
  isReadOnly: boolean;
  // Branch context
  branches: Branch[];
  activeBranchId: string | null;
  setActiveBranch: (branchId: string) => void;
  // Auth actions
  // Call after the API has set the session cookie (login / register / onboarding).
  setSession: (userData?: Partial<UserSession>) => void;
  logout: (customRedirect?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [businessSubscription, setBusinessSubscription] = useState<
    BusinessSubscription | null
  >(null);

  // ── Fetch branches for the current user's business ──────────────────────
  const fetchBranches = useCallback(async (businessId: string) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/product/getbranches`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.branches)) {
        const fetchedBranches: Branch[] = data.branches;
        setBranches(fetchedBranches);

        // Restore or default activeBranchId
        const storageKey = `activeBranch_${businessId}`;
        const stored = localStorage.getItem(storageKey);
        const validStored =
          stored && fetchedBranches.some((b) => b.id === stored);
        const resolved = validStored ? stored : fetchedBranches[0]?.id ?? null;
        setActiveBranchId(resolved);
      }
    } catch (err) {
      console.warn("Could not fetch branches:", err);
    }
  }, []);

  const dropSession = useCallback(() => {
    clearAuthStorage();
    setTokenState(null);
    setUser(null);
    setBranches([]);
    setActiveBranchId(null);
    setBusinessSubscription(null);
  }, []);

  // ── Resolve the cookie session (token kept in memory, emailVerified) ─────
  const fetchSession = useCallback(async (): Promise<{
    ok: boolean;
    emailVerified?: boolean;
  }> => {
    try {
      const { data, error } = await authClient.getSession();
      if (error) {
        // Only an explicit 401 ends the session; 5xx / offline keep the cache.
        return { ok: error.status !== 401 };
      }
      if (!data?.session) return { ok: false };
      setTokenState(data.session.token ?? null);
      return { ok: true, emailVerified: Boolean(data.user?.emailVerified) };
    } catch {
      // Network failure: keep whatever we have (offline-first).
      return { ok: true };
    }
  }, []);

  // ── Fetch full user profile from /user/me ────────────────────────────────
  const fetchUserProfile = useCallback(
    async (emailVerified?: boolean) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/user/me`);

        if (res.status === 401) {
          dropSession();
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            const freshUser: UserSession = {
              id: data.id,
              name: data.name,
              email: data.email,
              role: data.role || "OWNER",
              businessId: data.businessId,
              phone: data.phone,
              avatarUrl: data.avatarUrl,
              emailVerified:
                typeof data.emailVerified === "boolean"
                  ? data.emailVerified
                  : emailVerified,
            };
            setUser(freshUser);
            localStorage.setItem("user", JSON.stringify(freshUser));

            if (data.business) {
              const freshSubscription: BusinessSubscription = {
                status: data.business.status,
                subscriptionExpiresAt: data.business.subscriptionExpiresAt,
              };
              setBusinessSubscription(freshSubscription);
              localStorage.setItem(
                "businessSubscription",
                JSON.stringify(freshSubscription),
              );
            } else {
              setBusinessSubscription(null);
            }

            // Fetch branches once we have a confirmed businessId
            if (data.businessId) {
              await fetchBranches(data.businessId);
            }
          }
        }
      } catch (err) {
        console.warn("Could not refresh user session from /user/me:", err);
      }
    },
    [fetchBranches, dropSession],
  );

  const loadSession = useCallback(async () => {
    const session = await fetchSession();
    if (!session.ok) {
      dropSession();
      return false;
    }
    await fetchUserProfile(session.emailVerified);
    return true;
  }, [fetchSession, fetchUserProfile, dropSession]);

  // ── Hydrate on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    // Tokens from the pre-cookie login flow must not linger in the browser.
    clearLegacyAuthStorage();

    // 1. Immediate hydration from the cached profile (offline-friendly)
    try {
      const raw = localStorage.getItem("user");
      const cached = raw ? (JSON.parse(raw) as Partial<UserSession>) : null;
      if (cached && typeof cached.id === "string" && cached.id) {
        setUser({
          id: cached.id,
          name: cached.name || "User",
          email: cached.email || "",
          role: String(cached.role || "OWNER").toUpperCase(),
          businessId: cached.businessId ?? null,
          phone: cached.phone ?? null,
          avatarUrl: cached.avatarUrl ?? null,
          emailVerified: cached.emailVerified,
        });
        const rawSub = localStorage.getItem("businessSubscription");
        if (rawSub) setBusinessSubscription(JSON.parse(rawSub));
        if (cached.businessId) {
          const stored = localStorage.getItem(
            `activeBranch_${cached.businessId}`,
          );
          if (stored) setActiveBranchId(stored);
        }
        setIsLoading(false);
      }
    } catch {}

    // 2. Confirm with the API (cookie session) and refresh profile + branches
    loadSession().finally(() => setIsLoading(false));
  }, [loadSession]);

  const setActiveBranch = useCallback(
    (branchId: string) => {
      setActiveBranchId(branchId);
      if (user?.businessId) {
        localStorage.setItem(`activeBranch_${user.businessId}`, branchId);
      }
    },
    [user?.businessId],
  );

  const setSession = useCallback(
    (userData?: Partial<UserSession>) => {
      if (userData?.id) {
        const combinedUser: UserSession = {
          id: userData.id,
          name: userData.name || "User",
          email: userData.email || "",
          role: (userData.role || "OWNER").toUpperCase(),
          businessId: userData.businessId || null,
          phone: userData.phone || null,
          avatarUrl: userData.avatarUrl || null,
          emailVerified: userData.emailVerified,
        };
        setUser(combinedUser);
        localStorage.setItem("user", JSON.stringify(combinedUser));
      }
      setIsLoading(false);
      // Sync token, fresh details and branches
      void loadSession();
    },
    [loadSession],
  );

  const logout = useCallback(
    async (customRedirect?: string) => {
      const isSuperAdmin = user?.role === "SUPER_ADMIN";

      // Revoke the server session and clear the cookie (best effort).
      try {
        const res = await apiFetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
        });
        if (!res.ok) await authClient.signOut();
      } catch {
        try {
          await authClient.signOut();
        } catch {
          // Ignore network errors during logout
        }
      }

      // Wipe the offline cache (unsynced sales stay in the write queue).
      try {
        const { clearOfflineData } = await import("@/lib/sync/clear");
        await clearOfflineData();
      } catch (err) {
        console.warn("Could not clear offline data on logout:", err);
      }

      dropSession();

      // Force hard redirect to appropriate login
      window.location.href =
        customRedirect || (isSuperAdmin ? `${AGENCY_APP_URL}/login` : "/login");
    },
    [user, dropSession],
  );

  const refreshUser = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const role = useMemo(() => user?.role || null, [user]);
  const isAuthenticated = useMemo(
    () => Boolean(user),
    [user],
  );

  const isReadOnly = useMemo(() => {
    if (!businessSubscription) return false;
    const status = (businessSubscription.status || "").toUpperCase();
    if (status === "READ_ONLY" || status === "SUSPENDED") return true;
    if (businessSubscription.subscriptionExpiresAt) {
      const exp = new Date(businessSubscription.subscriptionExpiresAt);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return true;
      }
    }
    return false;
  }, [businessSubscription]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      token,
      isAuthenticated,
      isLoading,
      businessSubscription,
      isReadOnly,
      branches,
      activeBranchId,
      setActiveBranch,
      setSession,
      logout,
      refreshUser,
    }),
    [
      user,
      role,
      token,
      isAuthenticated,
      isLoading,
      businessSubscription,
      isReadOnly,
      branches,
      activeBranchId,
      setActiveBranch,
      setSession,
      logout,
      refreshUser,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
