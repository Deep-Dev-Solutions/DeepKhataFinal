"use client";

import { useState } from "react";
import { Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmOpen: (data: { openingBalance: number; notes?: string }) => Promise<void>;
};

export default function OpenRegisterModal({
  isOpen,
  onClose,
  onConfirmOpen,
}: Props) {
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const quickAmounts = [0, 1000, 2000, 5000, 10000];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirmOpen({
        openingBalance: Number(openingBalance) || 0,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-testid="open-register-modal"
      title={
        <span className="flex items-center gap-2">
          <Unlock className="h-4 w-4 text-brand-700" />
          Start Shift / Open Drawer
        </span>
      }
      description="Record the initial cash float in the drawer."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="open-register-submit"
            type="submit"
            form="open-register-form"
            loading={submitting}
          >
            Open Cash Drawer
          </Button>
        </>
      }
    >
      <form id="open-register-form" onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">
            Opening Cash Float in Drawer (PKR)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-gray-400">
              PKR
            </span>
            <Input
              data-testid="open-register-float"
              type="number"
              min="0"
              required
              value={openingBalance === 0 ? "" : openingBalance}
              onChange={(e) =>
                setOpeningBalance(Math.max(0, parseFloat(e.target.value) || 0))
              }
              placeholder="0"
              className="pl-12 font-mono font-semibold"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {quickAmounts.map((amt) => (
              <Button
                key={amt}
                type="button"
                size="sm"
                variant={openingBalance === amt ? "primary" : "secondary"}
                className="h-6 px-2 text-caption"
                onClick={() => setOpeningBalance(amt)}
              >
                Rs {amt.toLocaleString()}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">
            Opening Shift Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Received 2,000 PKR in 100s and 50s small change from owner..."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </form>
    </Modal>
  );
}
