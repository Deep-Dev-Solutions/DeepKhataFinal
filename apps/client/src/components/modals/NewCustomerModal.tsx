"use client";

import { useState } from "react";
import { User, Phone, Store, Tag } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { enqueue } from "@/lib/sync/queue";
import { offlineDb } from "@/lib/db";
import { Customer } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void | Promise<void>;
  title?: string;
}

export default function NewCustomerModal({
  isOpen,
  onClose,
  onCreated,
  title = "New Customer (Udhar)",
}: NewCustomerModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = name.trim();
    const phoneTrimmed = phone.trim();
    if (!nameTrimmed || !phoneTrimmed) return;

    setIsSubmitting(true);
    setError("");

    const localId = crypto.randomUUID();
    const customerPayload = {
      id: localId,
      name: nameTrimmed,
      phone: phoneTrimmed,
      shopName: shopName.trim() || undefined,
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue("UPSERT_CUSTOMER", customerPayload, localId);
      await offlineDb.customers.put(customerPayload as any);
      setName("");
      setPhone("");
      setShopName("");
      await onCreated(customerPayload as any);
      onClose();
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/customer/newcustomer`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: nameTrimmed,
          phone: phoneTrimmed,
          shopName: shopName.trim() || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to add customer",
        );
      }

      setName("");
      setPhone("");
      setShopName("");
      await onCreated(data.customer);
      onClose();
    } catch (err) {
      const isNetworkErr =
        err instanceof TypeError ||
        (typeof navigator !== "undefined" && !navigator.onLine);
      if (isNetworkErr) {
        await enqueue("UPSERT_CUSTOMER", customerPayload, localId);
        await offlineDb.customers.put(customerPayload as any);
        setName("");
        setPhone("");
        setShopName("");
        await onCreated(customerPayload as any);
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-testid="new-customer-modal"
      title={
        <span className="flex items-center gap-2">
          <User className="w-4 h-4 text-brand-700" />
          {title}
        </span>
      }
      description="New customers get a Rs. 50,000 credit line automatically and can buy on Udhar immediately."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-caption text-gray-500">
            <Tag className="w-3 h-3" />
            Udhar account auto-activated
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button data-testid="new-customer-submit"
              type="submit"
              form="new-customer-form"
              loading={isSubmitting}
            >
              Create Customer
            </Button>
          </div>
        </div>
      }
    >
      <form id="new-customer-form" onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div
            data-testid="new-customer-error"
            className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-body font-medium text-danger-fg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">
              Customer Name *
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input data-testid="new-customer-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ahmed Raza"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">
              Phone Number *
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input data-testid="new-customer-phone"
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03xx-xxxxxxx"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">
            Shop Name (Optional)
          </label>
          <div className="relative">
            <Store className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. Raza Mobile Shop"
              className="pl-9"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}