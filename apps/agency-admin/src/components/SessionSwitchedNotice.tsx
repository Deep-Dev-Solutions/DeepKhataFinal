"use client";

import React, { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Blocking notice shown when the session cookie stopped belonging to the signed-in
 * Super Admin (view-as activation or a shop-owner login in another tab).
 *
 * It never redirects by itself: the page stays put so the admin can see what
 * happened, and the console stops issuing requests until the identity is restored.
 */
export default function SessionSwitchedNotice() {
  const { switchedIdentity, exitViewAs, signInAgain } = useAuth();
  const [exiting, setExiting] = useState(false);

  const who = switchedIdentity?.name || "another account";
  const business = switchedIdentity?.businessName;

  const onExit = async () => {
    setExiting(true);
    await exitViewAs();
    setExiting(false);
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-switched-title"
    >
      <div
        data-testid="session-switched"
        className="pointer-events-auto w-full max-w-lg rounded-xl border border-warning bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="session-switched-title"
              className="text-title font-semibold text-gray-900"
            >
              This browser is signed in as someone else
            </h2>
            <p className="mt-1 text-body text-gray-600">
              Signed in as{" "}
              <span className="font-semibold text-gray-900">{who}</span>
              {business ? (
                <>
                  {" "}
                  at <span className="font-semibold text-gray-900">{business}</span>
                </>
              ) : null}
              . This console only works for a Super Admin, so it is paused.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {switchedIdentity?.impersonated && (
            <button
              type="button"
              onClick={onExit}
              disabled={exiting}
              data-testid="session-switched-exit"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-body font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
            >
              {exiting && <Loader2 size={14} className="animate-spin" />}
              Exit view-as
            </button>
          )}
          <button
            type="button"
            onClick={signInAgain}
            disabled={exiting}
            data-testid="session-switched-login"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-card px-4 py-2 text-body font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}
