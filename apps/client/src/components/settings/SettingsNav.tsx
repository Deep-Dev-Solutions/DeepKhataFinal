import { Store, Users, Globe, Bell, User, GitBranch } from "lucide-react";
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
    <nav className="flex items-center gap-6 border-b border-slate-200 w-full overflow-x-auto hide-scrollbar mb-8">
      {/* 🟢 HUMAN USER TABS (Visible to Everyone) */}
      <button
        onClick={() => setActiveTab("profile")}
        className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "profile" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
      >
        <User className="w-4 h-4" /> My Profile
      </button>

      {/* 🟢 BUSINESS TABS (Visible to Owners Only) */}
      {(hasPermission("manage:business") || hasPermission("manage:team")) && (
        <>
          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "general" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
            >
              <Store className="w-4 h-4" /> General Info
            </button>
          )}

          {hasPermission("manage:team") && (
            <button
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "team" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
            >
              <Users className="w-4 h-4" /> Team & Roles
            </button>
          )}

          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("branches")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "branches" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
            >
              <GitBranch className="w-4 h-4" /> Branches / Locations
            </button>
          )}

          {hasPermission("manage:business") && (
            <button
              onClick={() => setActiveTab("portal")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "portal" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
            >
              <Globe className="w-4 h-4" /> Customer Portal
            </button>
          )}
        </>
      )}

      {/* Visible to Everyone */}
      <button
        onClick={() => setActiveTab("notifications")}
        className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${activeTab === "notifications" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
      >
        <Bell className="w-4 h-4" /> Notifications
      </button>
    </nav>
  );
}
