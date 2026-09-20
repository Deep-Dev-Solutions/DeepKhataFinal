"use client";

import { useEffect, useState } from "react";
import { X, Mail, Shield, Send } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteSuccess?: (invite: {
    id: string;
    email: string;
    role: string;
    sentAt: string;
  }) => void;
  // businessId prop is now optional because we fetch it from localStorage
  businessId?: string | null;
}

export default function InviteStaffModal({
  isOpen,
  onClose,
  onInviteSuccess,
  businessId,
}: InviteStaffModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const readOnly = useIsReadOnly();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail("");
    setRole("STAFF");
    setError(null);
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // 🟢 1. FETCH BUSINESS ID FROM LOCAL STORAGE
    let currentBusinessId = businessId;

    // If it wasn't passed as a prop, look inside localStorage
    if (!currentBusinessId) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const userObj = JSON.parse(storedUser);
          currentBusinessId = userObj.businessId;
        } catch (err) {
          console.error("Failed to parse user from localStorage");
        }
      }
    }

    // 2. VALIDATE BUSINESS ID
    if (!currentBusinessId) {
      setError(
        "No workspace selected. Please complete onboarding or log in again.",
      );
      setIsSubmitting(false);
      return;
    }

    // 3. SEND API REQUEST
    try {
      const res = await fetch(`${API_BASE_URL}/team/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          email,
          role,
          businessId: currentBusinessId, // Pass the extracted ID here!
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.message || `Invite failed (${res.status})`);
      }

      const data = await res.json().catch(() => null);

      const invite = {
        id: data?.id || `INV-${Date.now()}`,
        email,
        role,
        sentAt: "Just now",
      };

      resetForm();
      onClose();

      if (typeof onInviteSuccess === "function") onInviteSuccess(invite);
    } catch (err: any) {
      setError(err?.message || "Failed to send invite");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark Blur Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => {
          resetForm();
          onClose();
        }}
      />

      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Invite Team Member
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              An invitation email will be sent to them.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ali@example.com"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Assign Role
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white appearance-none cursor-pointer"
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-600 font-medium text-center">
                {error}
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:opacity-70 ${
                readOnly
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {isSubmitting ? "Sending..." : readOnly ? "Read-only" : "Send Invite"}
              {!isSubmitting && !readOnly && <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
