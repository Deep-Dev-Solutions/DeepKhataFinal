"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { UploadCloud, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

export default function GeneralTab({
  business,
  onBusinessUpdate,
}: {
  business: any;
  onBusinessUpdate?: (updates: any) => void;
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
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
        method: "PUT",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
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
            <h2 className="text-base font-semibold text-slate-900">
              Brand Identity
            </h2>
            <p className="text-sm text-slate-500">
              Your logo and business name will appear on digital receipts.
            </p>
          </div>

          <div className="h-6">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                <AlertCircle className="w-3.5 h-3.5" /> Error saving
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row gap-8 items-start">
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
              className="w-20 h-20 rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer group shadow-sm relative overflow-hidden"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
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
            <span className="text-xs font-medium text-slate-500">
              {isUploading ? "Uploading..." : "Upload Logo"}
            </span>
          </div>

          <div className="flex-1 w-full space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Business / Shop Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => handleAutoSave("name", e.target.value)}
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      <hr className="border-slate-200" />

      <section>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Business Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={(e) => handleAutoSave("phone", e.target.value)}
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Support Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleAutoSave("email", e.target.value)}
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  handleAutoSave("currency", e.target.value);
                }}
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm bg-white cursor-pointer"
              >
                <option value="PKR">PKR (Pakistani Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Physical Shop Address
            </label>
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={(e) => handleAutoSave("address", e.target.value)}
              className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm resize-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
