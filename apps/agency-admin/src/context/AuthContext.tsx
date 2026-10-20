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
import { clearAuthStorage, clearLegacyAuthStorage } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

export interface UserSession {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  businessId?: string | null;
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
  /** Non-secret marker ("session") while signed in; the credential is the cookie. */
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Call after the API has set the session cookie (agency login).
  setSession: (userData?: Partial<UserSession>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_MARKER = "session";

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
    clearAuthStorage();
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        clearLegacyAuthStorage();

        // The API is the authority: it validates the cookie session.
        const data = await api.get<MeResponse>("/user/me");

        if (!data?.id || data.role !== "SUPER_ADMIN") {
          cancelSession();
          showToast(UNAUTHORIZED_MESSAGE, "error");
          goToLogin();
          return;
        }

        const freshUser: UserSession = {
          id: data.id,
          name: data.name || "Super Admin",
          email: data.email || "",
          role: data.role,
          businessId: data.businessId ?? null,
        };

        setTokenState(SESSION_MARKER);
        setUser(freshUser);
        if (typeof window !== "undefined") {
          localStorage.setItem("user", JSON.stringify(freshUser));
        }
      } catch (err) {
        // 401 (no or revoked session) or network failure: back to login.
        if (!(err instanceof ApiError) || err.status !== 401) {
          console.error("Session verification failed:", err);
        }
        cancelSession();
        goToLogin();
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, [cancelSession, goToLogin, showToast]);

  const setSession = useCallback((userData?: Partial<UserSession>) => {
    const combinedUser: UserSession = {
      id: userData?.id || "",
      name: userData?.name || "Super Admin",
      email: userData?.email || "",
      role: userData?.role || "SUPER_ADMIN",
      businessId: userData?.businessId || null,
    };

    setTokenState(SESSION_MARKER);
    setUser(combinedUser);
    setIsLoading(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(combinedUser));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore network errors during logout.
    }

    cancelSession();
    setIsLoading(false);
    goToLogin();
  }, [cancelSession, goToLogin]);

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
    () => Boolean(token && user && user.role === "SUPER_ADMIN"),
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