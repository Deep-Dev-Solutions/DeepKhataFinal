"use client";

import { useState, useRef } from "react";
import {
  User as UserIcon,
  CheckCircle2,
  Loader2,
  UploadCloud,
  AlertCircle,
} from "lucide-react";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { API_BASE_URL } from "@/lib/auth";
import { User } from "@/types/api";

export default function ProfileTab({ user }: { user: User }) {
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
        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
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
        credentials: "include",
        method: "PUT",
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
            <h2 className="text-base font-semibold text-gray-900">
              Personal Information
            </h2>
            <p className="text-body text-gray-500">
              Update your personal details.
            </p>
          </div>

          {/* 🟢 STATUS INDICATOR */}
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

        <div className="bg-card rounded-lg border border-border shadow-sm p-6 flex flex-col sm:flex-row gap-8 items-start">
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
              className="w-20 h-20 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-brand-200 hover:text-brand-700 transition-colors cursor-pointer group relative overflow-hidden"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-brand-700" />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
              )}
            </div>
            <span className="text-caption font-medium text-gray-500">
              {isUploading ? "Uploading..." : "Change Avatar"}
            </span>
          </div>

          <div className="flex-1 w-full space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-body font-medium text-gray-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={(e) => handleAutoSave("name", e.target.value)}
                  className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
                />
              </div>
              <div>
                <label className="block text-body font-medium text-gray-700 mb-1.5">
                  Personal Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => handleAutoSave("phone", e.target.value)}
                  className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-body font-medium text-gray-700 mb-1.5">
                Login Email
              </label>
              <input
                type="email"
                defaultValue={user.email}
                disabled
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 bg-gray-100 text-gray-500"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
