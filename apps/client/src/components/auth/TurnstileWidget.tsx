"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export const CAPTCHA_HEADER = "x-captcha-response";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the captcha"));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
 * unset (dev, tests, desktop mode). `onToken` receives the token, or null when
 * it expires or errors. Bump `resetKey` to get a fresh challenge (tokens are
 * single use, so reset after every submit that used one).
 */
export default function TurnstileWidget({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey === 0) return;
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={hostRef} data-testid="turnstile-widget" className="flex justify-center" />;
}

/** Token state plus a `reset()` that clears it and asks the widget for a new challenge. */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setResetKey((k) => k + 1);
  }, []);
  return {
    enabled: Boolean(TURNSTILE_SITE_KEY),
    token,
    setToken,
    resetKey,
    reset,
    /** Headers to merge into a request; empty when there is no token. */
    headers: (token ? { [CAPTCHA_HEADER]: token } : {}) as Record<string, string>,
  };
}
