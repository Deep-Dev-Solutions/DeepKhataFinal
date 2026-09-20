"use client";

import { useState, useRef } from "react";
import {
  User,
  CheckCircle2,
  Loader2,
  UploadCloud,
  AlertCircle,
} from "lucide-react";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { API_BASE_URL } from "@/lib/auth";

export default function ProfileTab({ user }: { user: any }) {
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readOnly = useIsReadOnly();

  // 🟢 AUTO-SAVE TEXT FIELDS (Runs onBlur)
  const handleAutoSave = async (field: string, value: string) => {
    if (readOnly) return;
    if (value === user[field]) return; // Don't save if nothing changed
    setSaveStatus("saving");

    try {
      const res = await fetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // 🟢 UPLOAD AVATAR TO CLOUDINARY
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setSaveStatus("saving");

    const formData = new FormData();
    formData.append("avatar", file); // Must match upload.single('avatar') in backend!

    try {
      const res = await fetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: formData, // No content-type needed for FormData
      });

      const data = await res.json();
      if (!res.ok) throw new Error("Upload failed");

      setAvatarUrl(data.profile.avatarUrl); // Instantly update UI
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
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
              Personal Information
            </h2>
            <p className="text-sm text-slate-500">
              Update your personal details.
            </p>
          </div>

          {/* 🟢 STATUS INDICATOR */}
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

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row gap-8 items-start">
          {/* AVATAR UPLOADER */}
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
              className="w-20 h-20 rounded-full bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer group relative overflow-hidden"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 group-hover:scale-110 transition-transform" />
              )}
            </div>
            <span className="text-xs font-medium text-slate-500">
              {isUploading ? "Uploading..." : "Change Avatar"}
            </span>
          </div>

          <div className="flex-1 w-full space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={(e) => handleAutoSave("name", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Personal Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => handleAutoSave("phone", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Login Email
              </label>
              <input
                type="email"
                defaultValue={user.email}
                disabled
                className="w-full border border-slate-200 rounded-lg py-2 px-3 outline-none text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
