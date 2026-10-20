"use client";

import { useEffect, type ReactNode } from "react";
import { syncEngine } from "@/lib/sync/engine";

/** Starts the app-wide sync engine once for everything inside the dashboard. */
export default function SyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    syncEngine.start();
    return () => syncEngine.stop();
  }, []);

  return <>{children}</>;
}
