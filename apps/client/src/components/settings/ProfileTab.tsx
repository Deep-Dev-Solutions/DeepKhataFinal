"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { User } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

export default function ProfileTab({
  user,
  onProfileUpdate,
}: {
  user: any;
  onProfileUpdate?: (updates: any) => void;
}) {
  const readOnly = useIsReadOnly();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setAvatarUrl(user?.avatarUrl || "");
  }, [user]);

  const updateProfileState = (updates: Record<string, unknown>) => {
    onProfileUpdate?.(updates);
  };

  const handleAutoSave = async (field: string, value: string) => {
    if (readOnly) return;
    const normalizedValue = value.trim();
    if (!normalizedValue) return;
    if (field === "name" && normalizedValue === user?.name) return;
    if (field === "phone" && normalizedValue === user?.phone) return;

    setIsSaving(true);
    setStatusMessage("Saving...");

    try {
      const res = await fetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          [field === "phone" ? "phone" : field]: normalizedValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to save");

      const updatedProfile = data.profile;
      if (updatedProfile?.name) setName(updatedProfile.name);
      if (updatedProfile?.phone) setPhone(updatedProfile.phone);
      updateProfileState({
        name: updatedProfile?.name ?? name,
        phone: updatedProfile?.phone ?? phone,
        email: updatedProfile?.email ?? user?.email,
        avatarUrl: updatedProfile?.avatarUrl ?? avatarUrl,
      });
      setStatusMessage("Saved");
    } catch {
      setStatusMessage("Could not save changes");
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setStatusMessage(""), 2200);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    setStatusMessage("Uploading avatar...");

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Avatar upload failed");

      const updatedProfile = data.profile;
      setAvatarUrl(updatedProfile?.avatarUrl || "");
      updateProfileState({
        name: updatedProfile?.name ?? name,
        phone: updatedProfile?.phone ?? phone,
        email: updatedProfile?.email ?? user?.email,
        avatarUrl: updatedProfile?.avatarUrl ?? avatarUrl,
      });
      setStatusMessage("Avatar updated");
    } catch {
      setStatusMessage("Could not upload avatar");
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      window.setTimeout(() => setStatusMessage(""), 2200);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      setPasswordStatus("error");
      setStatusMessage("Enter both password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus("error");
      setStatusMessage("Passwords do not match");
      return;
    }

    setIsSaving(true);
    setPasswordStatus("idle");

    try {
      const res = await fetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Password update failed");

      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("success");
      setStatusMessage("Password updated");
    } catch {
      setPasswordStatus("error");
      setStatusMessage("Could not update password");
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setStatusMessage(""), 2200);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Personal Information
            </h2>
            <p className="text-sm text-slate-500">
              Update your personal details and how you log in.
            </p>
          </div>
          {statusMessage ? (
            <span
              className={`text-xs font-medium ${statusMessage === "Saved" || statusMessage === "Avatar updated" || statusMessage === "Password updated" ? "text-emerald-600" : "text-slate-500"}`}
            >
              {statusMessage}
            </span>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row gap-8 items-start">
          <div className="flex flex-col items-center gap-3">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`w-20 h-20 rounded-full to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-sm overflow-hidden transition-all disabled:opacity-60 ${
                readOnly
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-gradient-to-tr from-blue-600 cursor-pointer"
              }`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                (user?.name || "U")
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly}
              className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Change Avatar
            </button>
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
                value={user?.email || ""}
                disabled
                className="w-full border border-slate-200 rounded-lg py-2 px-3 outline-none text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Your email cannot be changed here. Contact support if needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-slate-200" />

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Change Password
          </h2>
          <p className="text-sm text-slate-500">
            Ensure your account stays secure.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePasswordUpdate}
              disabled={isSaving || readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed ${
                readOnly
                  ? "bg-slate-400"
                  : "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
              }`}
            >
              {isSaving ? "Updating..." : "Update Password"}
            </button>
            {passwordStatus === "success" ? (
              <span className="text-sm text-emerald-600">Password updated</span>
            ) : null}
            {passwordStatus === "error" ? (
              <span className="text-sm text-rose-600">
                Please confirm your password
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
