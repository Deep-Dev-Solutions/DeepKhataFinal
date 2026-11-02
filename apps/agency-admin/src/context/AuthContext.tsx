"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { clearAuthStorage, clearLegacyAuthStorage } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import {
  subscribeToSessionEvents,
  type SessionIdentity,
} from "@/lib/session";

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
  business?: { id?: string; name?: string | null } | null;
}

interface SessionInfo {
  impersonated?: boolean;
  impersonatedUntil?: string;
  businessName?: string;
}

/** Who the browser is signed in as now, after somebody else took the cookie. */
export interface SwitchedIdentity {
  name: string;
  role: string | null;
  businessName: string | null;
  impersonated: boolean;
}

/**
 * "ok" - the console owns the session.
 * "switched" - the browser is signed in as someone else; the page is paused
 * behind SessionSwitchedNotice instead of being redirected to /login, because the
 * admin session can usually be recovered (Exit view-as) and losing the page would
 * hide what happened.
 */
export type SessionState = "ok" | "switched";

interface AuthContextType {
  user: UserSession | null;
  /** Non-secret marker ("session") while signed in; the credential is the cookie. */
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionState: SessionState;
  switchedIdentity: SwitchedIdentity | null;
  // Call after the API has set the session cookie (agency login).
  setSession: (userData?: Partial<UserSession>) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  exitViewAs: () => Promise<void>;
  signInAgain: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_MARKER = "session";

const UNAUTHORIZED_MESSAGE =
  "Your account is not authorized to access the Agency Console.";

const SESSION_ENDED_MESSAGE = "Session ended, sign in again.";

/** Window focus can fire in bursts; one check per 10s is plenty. */
const RECHECK_THROTTLE_MS = 10_000;

function toUserSession(data: MeResponse): UserSession {
  return {
    id: data.id,
    name: data.name || "Super Admin",
    email: data.email || "",
    role: data.role,
    businessId: data.businessId ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionState, setSessionState] = useState<SessionState>("ok");
  const [switchedIdentity, setSwitchedIdentity] =
    useState<SwitchedIdentity | null>(null);

  const lastRecheckRef = useRef(0);

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

  const isLoginPage = useCallback(
    () =>
      typeof window !== "undefined" && window.location.pathname === "/login",
    [],
  );

  /** 401 or a vanished session: the cookie is simply gone, go back to login. */
  const handleSessionExpired = useCallback(() => {
    if (isLoginPage()) return;
    cancelSession();
    setSessionState("ok");
    setSwitchedIdentity(null);
    showToast(SESSION_ENDED_MESSAGE, "error");
    goToLogin();
  }, [cancelSession, goToLogin, isLoginPage, showToast]);

  /**
   * The cookie now belongs to somebody who is not a SUPER_ADMIN. Keep the page
   * (and the admin profile in state) but block it until the admin recovers.
   */
  const handleSessionSwitched = useCallback(
    (identity: SessionIdentity | undefined) => {
      if (isLoginPage()) return;

      setSessionState("switched");
      setSwitchedIdentity({
        name: identity?.name || identity?.email || "another account",
        role: identity?.role ?? null,
        businessName: identity?.businessName ?? null,
        impersonated: false,
      });

      // Only the server knows whether this is a view-as session we can undo.
      api
        .get<SessionInfo>("/auth/session-info")
        .then((info) => {
          setSwitchedIdentity((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              impersonated: Boolean(info?.impersonated),
              businessName:
                info?.businessName ?? identity?.businessName ?? prev.businessName,
            };
          });
        })
        .catch(() => {
          // The notice still works; it just cannot offer "Exit view-as".
        });
    },
    [isLoginPage],
  );

  const resetToOk = useCallback(() => {
    setSessionState("ok");
    setSwitchedIdentity(null);
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

        const freshUser = toUserSession(data);

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

  // Central listener for api.ts auth failures.
  useEffect(() => {
    return subscribeToSessionEvents((detail) => {
      if (detail.type === "session-expired") {
        handleSessionExpired();
        return;
      }
      if (detail.type === "session-switched") {
        handleSessionSwitched(detail.user);
      }
      // "forbidden" means the session is still a SUPER_ADMIN: the caller shows it.
    });
  }, [handleSessionExpired, handleSessionSwitched]);

  // Coming back to the tab is when the cookie most often changed underneath us.
  useEffect(() => {
    const recheck = async () => {
      if (isLoginPage()) return;
      const now = Date.now();
      if (now - lastRecheckRef.current < RECHECK_THROTTLE_MS) return;
      lastRecheckRef.current = now;

      try {
        const data = await api.get<MeResponse>("/user/me");
        if (!data?.id || data.role !== "SUPER_ADMIN") {
          handleSessionSwitched(data ?? undefined);
          return;
        }
        // The admin session came back (e.g. Exit was pressed in the shop tab).
        resetToOk();
        setTokenState(SESSION_MARKER);
        setUser(toUserSession(data));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired();
        }
      }
    };

    const onFocus = () => {
      recheck().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        recheck().catch(() => {});
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [handleSessionExpired, handleSessionSwitched, isLoginPage, resetToOk]);

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
    setSessionState("ok");
    setSwitchedIdentity(null);
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
    setSessionState("ok");
    setSwitchedIdentity(null);
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

      const freshUser = toUserSession(data);
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

  const exitViewAs = useCallback(async () => {
    try {
      await api.post("/auth/view-as/exit");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch {
      showToast("Could not exit view-as. Sign in again.", "error");
    }
  }, [showToast]);

  const signInAgain = useCallback(() => {
    resetToOk();
    cancelSession();
    setIsLoading(false);
    goToLogin();
  }, [cancelSession, goToLogin, resetToOk]);

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
      sessionState,
      switchedIdentity,
      setSession,
      logout,
      refreshUser,
      exitViewAs,
      signInAgain,
    }),
    [
      user,
      token,
      isAuthenticated,
      isLoading,
      sessionState,
      switchedIdentity,
      setSession,
      logout,
      refreshUser,
      exitViewAs,
      signInAgain,
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
