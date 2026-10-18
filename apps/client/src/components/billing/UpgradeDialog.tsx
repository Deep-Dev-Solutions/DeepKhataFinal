"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RESOURCE_LABEL,
  upgradeWhatsappUrl,
  type PlanLimitBody,
} from "@/lib/billing";

interface Props {
  limit: PlanLimitBody | null;
  shopName?: string | null;
  onClose: () => void;
}

export default function UpgradeDialog({ limit, shopName, onClose }: Props) {
  const whatsapp = limit ? upgradeWhatsappUrl(shopName, limit.plan) : null;

  return (
    <Dialog open={Boolean(limit)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="plan-limit-dialog">
        <DialogHeader>
          <DialogTitle>Plan limit reached</DialogTitle>
          <DialogDescription>
            {limit ? RESOURCE_LABEL[limit.resource] : ""} limit on your{" "}
            {limit?.plan} plan.
          </DialogDescription>
        </DialogHeader>
        <p
          data-testid="plan-limit-message"
          className="text-sm text-slate-700 leading-relaxed"
        >
          {limit?.message}
        </p>
        {limit && (
          <p className="text-xs text-slate-500">
            Used {limit.used} of {limit.limit ?? "unlimited"}.
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            data-testid="plan-limit-close"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Not now
          </button>
          {whatsapp ? (
            <a
              data-testid="plan-limit-whatsapp"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Upgrade on WhatsApp
            </a>
          ) : (
            <span
              data-testid="plan-limit-whatsapp"
              className="rounded-xl bg-slate-100 px-4 py-2 text-center text-sm text-slate-500"
            >
              Contact your agency to upgrade
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
