import { Store, Users, Globe, Bell, User, GitBranch, CreditCard, Shield } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface SettingsNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function SettingsNav({
  activeTab,
  setActiveTab,
}: SettingsNavProps) {
  const { hasPermission } = usePermissions();

  return (
    <nav className="flex items-center gap-3.5 border-b border-border w-full overflow-x-auto hide-scrollbar">
      {/* 🟢 HUMAN USER TABS (Visible to Everyone) */}
      <button
        onClick={() => setActiveTab("profile")}
        className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "profile" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
      >
        <User className="w-4 h-4" /> My Profile
      </button>

      {/* 🟢 BUSINESS TABS (Visible to Owners Only) */}
      {(hasPermission("manage:business") || hasPermission("manage:team")) && (
        <>
          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "general" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <Store className="w-4 h-4" /> General Info
            </button>
          )}

          {hasPermission("manage:team") && (
            <button
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "team" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <Users className="w-4 h-4" /> Team & Roles
            </button>
          )}

          {hasPermission("manage:team") && (
            <button
              onClick={() => setActiveTab("plan")}
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "plan" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <CreditCard className="w-4 h-4" /> Plan & Usage
            </button>
          )}

          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("branches")}
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "branches" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <GitBranch className="w-4 h-4" /> Branches / Locations
            </button>
          )}

          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("portal")}
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "portal" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <Globe className="w-4 h-4" /> Customer Portal
            </button>
          )}

          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("access-log")}
              data-testid="settings-tab-access-log"
              className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "access-log" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
            >
              <Shield className="w-4 h-4" /> Access Log
            </button>
          )}
        </>
      )}

      {/* Visible to Everyone */}
      <button
        onClick={() => setActiveTab("notifications")}
        className={`flex items-center gap-2 pb-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "notifications" ? "border-brand-700 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}`}
      >
        <Bell className="w-4 h-4" /> Notifications
      </button>
    </nav>
  );
}
