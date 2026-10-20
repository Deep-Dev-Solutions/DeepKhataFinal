"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Laptop, ShieldCheck } from "lucide-react";
import { API_BASE_URL, apiFetch } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { User } from "@/types/api";

interface OwnSession {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

/** "Chrome on Android" style label from a raw user agent. */
function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

interface ProfileUpdates {
  name?: string;
  phone?: string;
  avatarUrl?: string;
}

export default function ProfileTab({
  user,
  onProfileUpdate,
}: {
  user: User;
  onProfileUpdate?: (updates: ProfileUpdates) => void;
}) {
  const readOnly = useIsReadOnly();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [sessions, setSessions] = useState<OwnSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionNote, setSessionNote] = useState("");
  const [revoking, setRevoking] = useState(false);
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
      const res = await apiFetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
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
      const res = await apiFetch(`${API_BASE_URL}/settings/profile`, {
        method: "PUT",
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

  const fetchSessions = async (): Promise<OwnSession[] | null> => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/sessions`);
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      // Sessions list is informational; keep the previous value.
      return null;
    }
  };

  const loadSessions = async () => {
    const list = await fetchSessions();
    if (list) setSessions(list);
  };

  useEffect(() => {
    let active = true;
    void fetchSessions().then((list) => {
      if (!active) return;
      if (list) setSessions(list);
      setSessionsLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevokeOthers = async () => {
    setSessionNote("");
    setRevoking(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/sessions/revoke-others`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not sign out");
      setSessionNote(
        data?.revoked
          ? `Signed out of ${data.revoked} other device${data.revoked === 1 ? "" : "s"}.`
          : "No other devices were signed in.",
      );
      await loadSessions();
    } catch (err) {
      setSessionNote(err instanceof Error ? err.message : "Could not sign out");
    } finally {
      setRevoking(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus("error");
      setPasswordMessage("Enter all three password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus("error");
      setPasswordMessage("Passwords do not match");
      return;
    }

    setIsChangingPassword(true);
    setPasswordStatus("idle");
    setPasswordMessage("");

    try {
      const res = await apiFetch(`${API_BASE_URL}/user/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        throw new Error(msg || "Password update failed");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("success");
      setPasswordMessage("Password updated. Your other devices were signed out.");
      await loadSessions();
    } catch (err) {
      setPasswordStatus("error");
      setPasswordMessage(
        err instanceof Error ? err.message : "Could not update password",
      );
    } finally {
      setIsChangingPassword(false);
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
            Ensure your account stays secure. Other devices are signed out when
            you change it.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label
                htmlFor="profile-change-current"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Current Password
              </label>
              <input
                id="profile-change-current"
                data-testid="profile-change-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="profile-change-new"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                New Password
              </label>
              <input
                id="profile-change-new"
                data-testid="profile-change-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="profile-change-confirm"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Confirm New Password
              </label>
              <input
                id="profile-change-confirm"
                data-testid="profile-change-confirm"
                type="password"
                autoComplete="new-password"
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
              data-testid="profile-change-submit"
              onClick={handlePasswordUpdate}
              disabled={isChangingPassword || readOnly}
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
              {isChangingPassword ? "Updating..." : "Update Password"}
            </button>
            {passwordMessage ? (
              <span
                data-testid="profile-change-status"
                className={`text-sm ${passwordStatus === "success" ? "text-emerald-600" : "text-rose-600"}`}
              >
                {passwordMessage}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <hr className="border-slate-200" />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Where you are signed in
            </h2>
            <p className="text-sm text-slate-500">
              Sign out devices you no longer use or recognise.
            </p>
          </div>
          <button
            type="button"
            data-testid="profile-revoke-others"
            onClick={() => void handleRevokeOthers()}
            disabled={revoking || sessions.filter((s) => !s.current).length === 0}
            className="flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {revoking ? "Signing out..." : "Sign out other devices"}
          </button>
        </div>
        {sessionNote && (
          <p
            data-testid="profile-sessions-note"
            className="mb-3 text-sm text-slate-600"
          >
            {sessionNote}
          </p>
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {sessionsLoading && sessions.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Loading sessions...</p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              data-testid="profile-session-row"
              data-current={session.current ? "true" : "false"}
              className="flex items-center gap-3 p-4"
            >
              <Laptop className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {describeAgent(session.userAgent)}
                  {session.current && (
                    <span className="ml-2 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      THIS DEVICE
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {session.ipAddress || "Unknown IP"} · Signed in{" "}
                  {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
