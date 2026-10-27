"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { UploadCloud, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

interface BusinessInfo {
  name?: string;
  phone?: string;
  email?: string;
  currency?: string;
  address?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export default function GeneralTab({
  business,
  onBusinessUpdate,
}: {
  business: BusinessInfo;
  onBusinessUpdate?: (updates: BusinessInfo) => void;
}) {
  const [name, setName] = useState(business?.name || "");
  const [phone, setPhone] = useState(business?.phone || "");
  const [email, setEmail] = useState(business?.email || "");
  const [currency, setCurrency] = useState(business?.currency || "PKR");
  const [address, setAddress] = useState(business?.address || "");
  const [logoUrl, setLogoUrl] = useState(business?.logoUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readOnly = useIsReadOnly();

  useEffect(() => {
    setName(business?.name || "");
    setPhone(business?.phone || "");
    setEmail(business?.email || "");
    setCurrency(business?.currency || "PKR");
    setAddress(business?.address || "");
    setLogoUrl(business?.logoUrl || "");
  }, [business]);

  const handleAutoSave = async (field: string, value: string) => {
    if (readOnly) return;
    if (value === business?.[field]) return;
    setSaveStatus("saving");

    try {
      const res = await fetch(`${API_BASE_URL}/settings/business`, {
        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ [field]: value }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to save");

      onBusinessUpdate?.({ [field]: value });
      if (field === "name") setName(value);
      if (field === "phone") setPhone(value);
      if (field === "email") setEmail(value);
      if (field === "currency") setCurrency(value);
      if (field === "address") setAddress(value);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      window.setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setSaveStatus("saving");

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch(`${API_BASE_URL}/settings/business`, {
        credentials: "include",
        method: "PUT",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Upload failed");

      setLogoUrl(data.business.logoUrl);
      onBusinessUpdate?.({ logoUrl: data.business.logoUrl });
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Brand Identity
            </h2>
            <p className="text-body text-gray-500">
              Your logo and business name will appear on digital receipts.
            </p>
          </div>

          <div className="h-6">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-caption font-semibold text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-caption font-semibold text-success">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-caption font-semibold text-danger">
                <AlertCircle className="w-3.5 h-3.5" /> Error saving
              </span>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row gap-8 items-start">
          <div className="flex flex-col items-center gap-3">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-brand-200 hover:text-brand-700 transition-colors cursor-pointer group shadow-sm relative overflow-hidden"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
              ) : logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UploadCloud className="w-6 h-6 group-hover:scale-110 transition-transform" />
              )}
            </div>
            <span className="text-caption font-medium text-gray-500">
              {isUploading ? "Uploading..." : "Upload Logo"}
            </span>
          </div>

          <div className="flex-1 w-full space-y-4">
            <div>
              <label className="block text-body font-medium text-gray-700 mb-1.5">
                Business / Shop Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => handleAutoSave("name", e.target.value)}
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
              />
            </div>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      <section>
        <div className="bg-card rounded-lg border border-border shadow-sm p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-body font-medium text-gray-700 mb-1.5">
                Business Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={(e) => handleAutoSave("phone", e.target.value)}
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
              />
            </div>
            <div>
              <label className="block text-body font-medium text-gray-700 mb-1.5">
                Support Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleAutoSave("email", e.target.value)}
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
              />
            </div>
            <div>
              <label className="block text-body font-medium text-gray-700 mb-1.5">
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  handleAutoSave("currency", e.target.value);
                }}
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 bg-card cursor-pointer"
              >
                <option value="PKR">PKR (Pakistani Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-body font-medium text-gray-700 mb-1.5">
              Physical Shop Address
            </label>
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={(e) => handleAutoSave("address", e.target.value)}
              className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 resize-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
