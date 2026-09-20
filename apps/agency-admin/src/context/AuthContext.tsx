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
  role?: string;
  businessId?: string | null;
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
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (token: string, userData?: Partial<UserSession>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ── Hydrate session on mount ─────────────────────────────────────────────
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
    const decoded = decodeJwt<JwtPayload>(activeToken);

    let initialUser: UserSession | null = null;
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
        role: decoded.role || cached?.role || "",
        businessId: decoded.businessId || cached?.businessId || null,
      };
      setUser(initialUser);
    }

    setIsLoading(false);

    if (initialUser) {
      refreshUser(activeToken);
    }
  }, []);

  const refreshUser = useCallback(async (activeToken?: string) => {
    const currentToken = activeToken || getAuthToken();
    if (!currentToken || !isTokenValid(currentToken)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/user/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.status === 401) {
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
            role: data.role,
            businessId: data.businessId,
          };
          setUser(freshUser);
          localStorage.setItem("user", JSON.stringify(freshUser));
        }
      }
    } catch {
      // Network errors are non-fatal for the agency console.
    }
  }, []);

  const setSession = useCallback(
    (newToken: string, userData?: Partial<UserSession>) => {
      setAuthToken(newToken);
      setTokenState(newToken);

      const decoded = decodeJwt<JwtPayload>(newToken);
      const combinedUser: UserSession = {
        id: userData?.id || decoded?.id || "",
        name: userData?.name || decoded?.name || "User",
        email: userData?.email || decoded?.email || "",
        role: userData?.role || decoded?.role || "",
        businessId: userData?.businessId || decoded?.businessId || null,
      };

      setUser(combinedUser);
      localStorage.setItem("user", JSON.stringify(combinedUser));
      refreshUser(newToken);
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    const activeToken = token || getAuthToken();

    clearAuthToken();
    setTokenState(null);
    setUser(null);

    try {
      if (activeToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${activeToken}` },
        });
      }
    } catch {
      // Ignore network errors during logout
    }

    window.location.href = "/login";
  }, [token]);

  const isAuthenticated = useMemo(
    () => Boolean(token && isTokenValid(token) && user),
    [token, user],
  );

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      setSession,
      logout,
      refreshUser,
    }),
    [user, token, isAuthenticated, isLoading, setSession, logout, refreshUser],
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