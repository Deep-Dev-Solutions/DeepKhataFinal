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
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  decodeJwt,
  isTokenValid,
} from "@/lib/auth";

export interface UserSession {
  id: string;
  name?: string;
  email?: string;
  role: "OWNER" | "STAFF" | string;
  businessId?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

interface JwtPayload {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  businessId?: string | null;
  exp?: number;
}

interface AuthContextType {
  user: UserSession | null;
  role: "OWNER" | "STAFF" | string | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (token: string, userData?: Partial<UserSession>) => void;
  logout: (customRedirect?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch full user profile from /user/me
  const fetchUserProfile = useCallback(async (activeToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/user/me`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (res.status === 401) {
        // Token rejected by server
        clearAuthToken();
        setTokenState(null);
        setUser(null);
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
          };
          setUser(freshUser);
          localStorage.setItem("user", JSON.stringify(freshUser));
        }
      }
    } catch (err) {
      // Network failure: offline or transient error, keep existing decoded state
      console.warn("Could not refresh user session from /user/me:", err);
    }
  }, []);

  // Hydrate on mount
  useEffect(() => {
    const activeToken = getAuthToken();

    if (!activeToken || !isTokenValid(activeToken)) {
      clearAuthToken();
      setTokenState(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    setTokenState(activeToken);

    // 1. Immediate hydration from decoded JWT and cached localStorage
    let initialUser: UserSession | null = null;
    const decoded = decodeJwt<JwtPayload>(activeToken);

    if (decoded?.id) {
      let cached: any = null;
      try {
        const raw = localStorage.getItem("user");
        if (raw) cached = JSON.parse(raw);
      } catch {}

      initialUser = {
        id: decoded.id,
        name: decoded.name || cached?.name || "User",
        email: decoded.email || cached?.email || "",
        role: (decoded.role || cached?.role || "OWNER").toUpperCase(),
        businessId: decoded.businessId || cached?.businessId || null,
        phone: cached?.phone || null,
        avatarUrl: cached?.avatarUrl || null,
      };
      setUser(initialUser);
    }

    setIsLoading(false);

    // 2. Fetch fresh user details from /user/me
    fetchUserProfile(activeToken);
  }, [fetchUserProfile]);

  const setSession = useCallback(
    (newToken: string, userData?: Partial<UserSession>) => {
      setAuthToken(newToken);
      setTokenState(newToken);

      const decoded = decodeJwt<JwtPayload>(newToken);
      const combinedUser: UserSession = {
        id: userData?.id || decoded?.id || "",
        name: userData?.name || decoded?.name || "User",
        email: userData?.email || decoded?.email || "",
        role: (userData?.role || decoded?.role || "OWNER").toUpperCase(),
        businessId: userData?.businessId || decoded?.businessId || null,
        phone: userData?.phone || null,
        avatarUrl: userData?.avatarUrl || null,
      };

      setUser(combinedUser);
      localStorage.setItem("user", JSON.stringify(combinedUser));

      // Sync fresh details
      fetchUserProfile(newToken);
    },
    [fetchUserProfile],
  );

  const logout = useCallback(
    async (customRedirect?: string) => {
      const activeToken = token || getAuthToken();
      const isSuperAdmin = user?.role === "SUPER_ADMIN";

      // Clear client-side state & tokens first
      clearAuthToken();
      setTokenState(null);
      setUser(null);

      // Best-effort notify backend to clear cookie/session
      try {
        if (activeToken) {
          await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${activeToken}`,
            },
          });
        }
      } catch {
        // Ignore network errors during logout
      }

      // Force hard redirect to appropriate login
      window.location.href =
        customRedirect || (isSuperAdmin ? "/agency-admin/login" : "/login");
    },
    [token, user],
  );

  const refreshUser = useCallback(async () => {
    const activeToken = token || getAuthToken();
    if (activeToken && isTokenValid(activeToken)) {
      await fetchUserProfile(activeToken);
    }
  }, [token, fetchUserProfile]);

  const role = useMemo(() => user?.role || null, [user]);
  const isAuthenticated = useMemo(
    () => Boolean(token && isTokenValid(token) && user),
    [token, user],
  );

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      token,
      isAuthenticated,
      isLoading,
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
