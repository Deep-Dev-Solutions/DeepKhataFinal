"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SettingsNav from "@/components/settings/SettingsNav";
import ProfileTab from "@/components/settings/ProfileTab";
import GeneralTab from "@/components/settings/GeneralTab";
import TeamTab from "@/components/settings/TeamTab";
import PlanUsageTab from "@/components/settings/PlanUsageTab";
import PortalTab from "@/components/settings/PortalTab";
import BranchesTab from "@/components/settings/BranchesTab";
import NotificationsTab from "@/components/settings/NotificationsTab";
import AccessLogTab from "@/components/settings/AccessLogTab";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { API_BASE_URL, apiFetch, getAuthHeaders } from "@/lib/auth";

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
        const headers = getAuthHeaders();

        // Fetch Profile & Business simultaneously for speed
        const [profileRes, businessRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/settings/profileinfo`, { headers }),
          apiFetch(`${API_BASE_URL}/settings/businessinfo`, { headers }),
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
        <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
      </div>
    );
  }

  if (error || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-danger font-semibold gap-2">
        <AlertCircle className="w-5 h-5" /> {error}
      </div>
    );
  }

  return (
    <div className="mt-1 flex w-full animate-in flex-col gap-4 pb-24 fade-in duration-300">
      <PageHeader
        title="Settings & Workspace"
        subtitle="Manage your profile, preferences, and workspace."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-caption font-medium text-gray-500">Role</span>
            <Badge variant={userProfile.role === "OWNER" ? "brand" : "neutral"}>
              {userProfile.role}
            </Badge>
          </div>
        }
      />

      <SettingsNav activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex w-full flex-col gap-4">
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
        {activeTab === "plan" && hasPermission("manage:team") && <PlanUsageTab />}
        {activeTab === "branches" && hasPermission("manage:business") && (
          <BranchesTab />
        )}
        {activeTab === "portal" && hasPermission("manage:business") && (
          <PortalTab user={userProfile} />
        )}
        {activeTab === "access-log" && hasPermission("manage:business") && (
          <AccessLogTab />
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
          <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
