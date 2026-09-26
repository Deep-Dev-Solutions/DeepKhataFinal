"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, MapPin, Phone, User, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

interface AddVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

const initialFormData = {
  businessName: "",
  contactName: "",
  phone: "",
  address: "",
};

export default function AddVendorModal({
  isOpen,
  onClose,
  onSuccess,
}: AddVendorModalProps) {
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setError("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const closeModal = () => {
    if (!isSubmitting) onClose();
  };

  const updateField = (field: keyof typeof initialFormData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/vendors`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          businessName: formData.businessName.trim(),
          contactName: formData.contactName.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to create vendor",
        );
      }

      await onSuccess?.();
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to create vendor",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={closeModal}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-vendor-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-5">
          <div>
            <h2
              id="add-vendor-title"
              className="flex items-center gap-2 text-lg font-bold text-slate-900"
            >
              <Building2 className="h-5 w-5 text-indigo-600" />
              Add New Vendor
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Track supplier purchases and accounts payable.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close add vendor dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Business Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                autoFocus
                value={formData.businessName}
                onChange={(event) => updateField("businessName", event.target.value)}
                placeholder="e.g. Ali Traders"
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Contact Person
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(event) => updateField("contactName", event.target.value)}
                  placeholder="e.g. Usman"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="0300 1234567"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Address
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <textarea
                rows={3}
                value={formData.address}
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="Shop location or warehouse address..."
                className="w-full resize-none rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : "Create Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}