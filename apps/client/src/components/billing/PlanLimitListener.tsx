"use client";

import { useEffect, useState } from "react";
import UpgradeDialog from "@/components/billing/UpgradeDialog";
import { PLAN_LIMIT_EVENT, type PlanLimitBody } from "@/lib/billing";

/** Mount once in the dashboard layout. Opens the upgrade dialog on PLAN_LIMIT_REACHED. */
export default function PlanLimitListener() {
  const [limit, setLimit] = useState<PlanLimitBody | null>(null);

  useEffect(() => {
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<PlanLimitBody>).detail;
      if (detail?.code === "PLAN_LIMIT_REACHED") setLimit(detail);
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);

  return <UpgradeDialog limit={limit} onClose={() => setLimit(null)} />;
}
