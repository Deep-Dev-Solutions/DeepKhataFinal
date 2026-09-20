"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  decodeJwt,
  isTokenValid,
} from "@/lib/auth";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

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

interface MeResponse {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  businessId?: string | null;
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

const UNAUTHORIZED_MESSAGE =
  "Your account is not authorized to access the Agency Console.";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const goToLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/login") {
      router.replace("/login");
    }
  }, [router]);

  const cancelSession = useCallback(() => {
    clearAuthToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const initAuth = useCallback(async () => {
    let activeToken: string | null = null;

    try {
      activeToken = getAuthToken();

      if (!activeToken || !isTokenValid(activeToken)) {
        cancelSession();
        goToLogin();
        return;
      }

      const decoded = decodeJwt<JwtPayload>(activeToken);
      if (!decoded?.id || decoded.role !== "SUPER_ADMIN") {
        cancelSession();
        showToast(UNAUTHORIZED_MESSAGE, "error");
        goToLogin();
        return;
      }

      setTokenState(activeToken);

      const data = await api.get<MeResponse>("/user/me");

      if (!data?.id || data.role !== "SUPER_ADMIN") {
        cancelSession();
        showToast(UNAUTHORIZED_MESSAGE, "error");
        goToLogin();
        return;
      }

      const freshUser: UserSession = {
        id: data.id,
        name: data.name || decoded.name || "Super Admin",
        email: data.email || decoded.email || "",
        role: data.role,
        businessId: data.businessId ?? null,
      };

      setUser(freshUser);
      if (typeof window !== "undefined") {
        localStorage.setItem("user", JSON.stringify(freshUser));
      }
    } catch (err) {
      console.error("Session verification failed:", err);
      cancelSession();
      goToLogin();
    } finally {
      setIsLoading(false);
    }
  }, [cancelSession, goToLogin, showToast]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const setSession = useCallback(
    (newToken: string, userData?: Partial<UserSession>) => {
      setAuthToken(newToken);
      setTokenState(newToken);

      const decoded = decodeJwt<JwtPayload>(newToken);
      const combinedUser: UserSession = {
        id: userData?.id || decoded?.id || "",
        name: userData?.name || decoded?.name || "Super Admin",
        email: userData?.email || decoded?.email || "",
        role: userData?.role || decoded?.role || "SUPER_ADMIN",
        businessId: userData?.businessId || decoded?.businessId || null,
      };

      setUser(combinedUser);
      setIsLoading(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("user", JSON.stringify(combinedUser));
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const activeToken = token || getAuthToken();

    try {
      if (activeToken) {
        await api.post("/auth/logout");
      }
    } catch {
      // Ignore network errors during logout.
    }

    cancelSession();
    setIsLoading(false);
    goToLogin();
  }, [token, cancelSession, goToLogin]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>("/user/me");
      if (!data?.id || data.role !== "SUPER_ADMIN") {
        cancelSession();
        showToast(UNAUTHORIZED_MESSAGE, "error");
        goToLogin();
        return;
      }

      const freshUser: UserSession = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        businessId: data.businessId ?? null,
      };
      setUser(freshUser);
      if (typeof window !== "undefined") {
        localStorage.setItem("user", JSON.stringify(freshUser));
      }
    } catch (err) {
      console.error("Session verification failed:", err);
      cancelSession();
      goToLogin();
    }
  }, [cancelSession, goToLogin, showToast]);

  const isAuthenticated = useMemo(
    () => Boolean(token && isTokenValid(token) && user && user.role === "SUPER_ADMIN"),
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