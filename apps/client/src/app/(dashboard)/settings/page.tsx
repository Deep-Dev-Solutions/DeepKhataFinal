"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SettingsNav from "@/components/settings/SettingsNav";
import ProfileTab from "@/components/settings/ProfileTab";
import GeneralTab from "@/components/settings/GeneralTab";
import TeamTab from "@/components/settings/TeamTab";
import PortalTab from "@/components/settings/PortalTab";
import BranchesTab from "@/components/settings/BranchesTab";
import NotificationsTab from "@/components/settings/NotificationsTab";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth";

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromQuery || "profile");
  const { hasPermission } = usePermissions();

  const [userProfile, setUserProfile] = useState<any>(null);
  const [businessData, setBusinessData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const updateUserProfile = (updates: any) => {
    setUserProfile((prev: any) => (prev ? { ...prev, ...updates } : prev));
  };

  const updateBusinessData = (updates: any) => {
    setBusinessData((prev: any) => (prev ? { ...prev, ...updates } : prev));
  };

  // Sync tab state whenever URL search param changes
  useEffect(() => {
    if (tabFromQuery) {
      setActiveTab(tabFromQuery);
    }
  }, [tabFromQuery]);

  // 🟢 FETCH DATA ON MOUNT
  useEffect(() => {
    const fetchSettingsData = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        // Fetch Profile & Business simultaneously for speed
        const [profileRes, businessRes] = await Promise.all([
          fetch(`${API_BASE_URL}/settings/profileinfo`, { headers }),
          fetch(`${API_BASE_URL}/settings/businessinfo`, { headers }),
        ]);

        const profileData = await profileRes.json();
        const businessJson = await businessRes.json();

        if (profileData.success) setUserProfile(profileData.profile);
        if (businessJson.success) setBusinessData(businessJson.business);

        // If a tab parameter is explicitly present, respect it.
        // Otherwise, if owner default to general tab; if staff default to profile.
        if (tabFromQuery) {
          setActiveTab(tabFromQuery);
        } else if (hasPermission("manage:business")) {
          setActiveTab("general");
        }
      } catch (err: any) {
        setError("Failed to load settings data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettingsData();
  }, [hasPermission, tabFromQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-rose-600 font-bold gap-2">
        <AlertCircle className="w-5 h-5" /> {error}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col animate-in fade-in duration-500 pb-24 mt-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Settings & Workspace
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your profile, preferences, and workspace.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500 font-medium">Role:</span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-md ${userProfile.role === "OWNER" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-700"}`}
          >
            {userProfile.role}
          </span>
        </div>
      </div>

      <SettingsNav activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="w-full flex flex-col gap-8">
        {activeTab === "profile" && (
          <ProfileTab user={userProfile} onProfileUpdate={updateUserProfile} />
        )}

        {activeTab === "general" && hasPermission("manage:business") && (
          <GeneralTab
            business={businessData}
            onBusinessUpdate={updateBusinessData}
          />
        )}
        {activeTab === "team" && hasPermission("manage:team") && <TeamTab />}
        {activeTab === "branches" && hasPermission("manage:business") && (
          <BranchesTab />
        )}
        {activeTab === "portal" && hasPermission("manage:business") && (
          <PortalTab user={userProfile} />
        )}

        {activeTab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
