"use client";

import { useEffect, useState } from "react";
import {
  UserPlus,
  UserCog,
  Shield,
  Trash2,
  Mail,
  XCircle,
  ChevronDown,
  KeyRound,
  LogOut,
  UserX,
  UserCheck,
  MessageCircle,
  X,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders, apiFetch } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import InviteStaffModal from "@/components/modals/InviteStaffModal";
import AlertDialog from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePermissions } from "@/hooks/usePermissions";

/** Row of GET /team/members (email is null for username-only staff). */
type ActiveMember = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  allBranches: boolean;
  branchIds: string[];
  lastActiveAt: string | null;
  activeSessions: number;
  deactivatedAt: string | null;
  isOwner: boolean;
};

type CreatedMemberResult = {
  member: ActiveMember;
  loginUrl: string;
  loginUsername: string;
  whatsappText: string;
};

function formatLastActive(value: string | null): string {
  if (!value) return "Never signed in";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never signed in";
  return `Active ${date.toLocaleString()}`;
}

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  sentAt: string;
};

/** Invitation row as returned by GET /team/pending-invites. */
type PendingInviteResponse = {
  id?: string;
  token?: string;
  email: string;
  role: string;
  createdAt?: string;
};

export default function TeamTab() {
  // 🟢 State to toggle between Active Team and Pending Invites
  const [viewState, setViewState] = useState<"active" | "pending">("active");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<{
    email: string;
    action: "resend" | "cancel";
  } | null>(null);
  const [cancelInviteEmail, setCancelInviteEmail] = useState<string | null>(
    null,
  );
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    member: ActiveMember;
    role: string;
  } | null>(null);
  const [revokeMember, setRevokeMember] = useState<ActiveMember | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "STAFF",
    allBranches: true,
    branchIds: [] as string[],
  });
  const [createResult, setCreateResult] = useState<CreatedMemberResult | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<ActiveMember | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<ActiveMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ActiveMember | null>(
    null,
  );
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { user: authUser, activeBranchId, branches } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageTeam = hasPermission("manage:team");

  const loadTeamData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [activeRes, pendingRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/team/members`, {
          headers: getAuthHeaders(),
        }),
        apiFetch(`${API_BASE_URL}/team/pendinginvites`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const activeData = await activeRes.json().catch(() => null);
      const pendingData = await pendingRes.json().catch(() => null);

      if (!activeRes.ok) {
        throw new Error(
          activeData?.message ||
            `Failed to load active members (${activeRes.status})`,
        );
      }

      if (!pendingRes.ok) {
        throw new Error(
          pendingData?.message ||
            `Failed to load pending invites (${pendingRes.status})`,
        );
      }

      const mappedActive: ActiveMember[] = (
        Array.isArray(activeData) ? activeData : activeData?.members || []
      ).map((member: ActiveMember) => ({
        id: member.id,
        name: member.name,
        email: member.email ?? null,
        username: member.username ?? null,
        role: member.role,
        allBranches: Boolean(member.allBranches),
        branchIds: member.branchIds ?? [],
        lastActiveAt: member.lastActiveAt ?? null,
        activeSessions: member.activeSessions ?? 0,
        deactivatedAt: member.deactivatedAt ?? null,
        isOwner: Boolean(member.isOwner) || member.role === "OWNER",
      }));

      const mappedPending = (pendingData?.pendingInvites || []).map(
        (invite: PendingInviteResponse, index: number) => ({
          id: invite.id || invite.token || `${invite.email}-${index}`,
          email: invite.email,
          role: invite.role,
          sentAt: invite.createdAt
            ? new Date(invite.createdAt).toLocaleString()
            : "Just now",
        }),
      );

      setActiveMembers(mappedActive);
      setPending(mappedPending);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Failed to load team data") || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeamData();
  }, []);

  const storedUser =
    typeof window !== "undefined" ? localStorage.getItem("user") : null;
  let currentBusinessId: string | null = null;
  try {
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      currentBusinessId = parsed?.businessId || null;
    }
  } catch {
    currentBusinessId = null;
  }

  const handleResendInvite = async (email: string) => {
    if (readOnly) return;
    setError(null);
    setProcessing({ email, action: "resend" });
    try {
      const res = await apiFetch(`${API_BASE_URL}/team/resendinvite`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ email, businessId: currentBusinessId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to resend invitation");
      }
      await loadTeamData();
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Failed to resend invitation") || "Failed to resend invitation");
    } finally {
      setProcessing(null);
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (readOnly) return;
    setError(null);
    setProcessing({ email, action: "cancel" });
    try {
      const res = await apiFetch(`${API_BASE_URL}/team/cancelinvite`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to cancel invitation");
      }
      await loadTeamData();
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Failed to cancel invitation") || "Failed to cancel invitation");
    } finally {
      setProcessing(null);
    }
  };

  const isSelf = (member: ActiveMember) =>
    !!authUser?.id && member.id === authUser.id;

  const memberLabel = (member: ActiveMember) =>
    member.email || member.username || member.name;

  const handleUpdateRole = async (member: ActiveMember, role: string) => {
    if (readOnly || !canManageTeam) return;
    setMemberBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/team/members/${member.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update role");
      }
      toast.success(`${member.name} is now ${role}`);
      await loadTeamData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setMemberBusy(false);
    }
  };

  /** POST /team/members/:id/<action> helper for the simple member actions. */
  const runMemberAction = async (
    member: ActiveMember,
    action: "sign-out-all" | "deactivate" | "reactivate",
    successMessage: string,
  ) => {
    if (readOnly || !canManageTeam) return;
    setMemberBusy(true);
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/team/members/${member.id}/${action}`,
        { method: "POST", headers: getAuthHeaders(activeBranchId) },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Action failed");
      }
      toast.success(successMessage);
      await loadTeamData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setMemberBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || readOnly || !canManageTeam) return;
    setMemberBusy(true);
    setResetError(null);
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/team/members/${resetTarget.id}/reset-password`,
        {
          method: "POST",
          headers: getAuthHeaders(activeBranchId),
          body: JSON.stringify({ newPassword: resetPassword }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        throw new Error(msg || "Failed to reset password");
      }
      toast.success(
        `Password reset for ${resetTarget.name}. They were signed out everywhere.`,
      );
      setResetTarget(null);
      setResetPassword("");
      await loadTeamData();
    } catch (err: unknown) {
      setResetError(
        err instanceof Error ? err.message : "Failed to reset password",
      );
    } finally {
      setMemberBusy(false);
    }
  };

  const openCreate = () => {
    setCreateForm({
      name: "",
      username: "",
      password: "",
      role: "STAFF",
      allBranches: true,
      branchIds: [],
    });
    setCreateError(null);
    setCreateResult(null);
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    setIsCreateOpen(false);
    setCreateResult(null);
    setCreateError(null);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !canManageTeam) return;
    setCreateError(null);
    if (!createForm.allBranches && createForm.branchIds.length === 0) {
      setCreateError("Pick at least one branch, or choose all branches.");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/team/members`, {
        method: "POST",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({
          name: createForm.name.trim(),
          username: createForm.username.trim().toLowerCase(),
          password: createForm.password,
          role: createForm.role,
          allBranches: createForm.allBranches,
          ...(createForm.allBranches ? {} : { branchIds: createForm.branchIds }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === "EMAIL_NOT_VERIFIED") {
          throw new Error(
            "Verify your email first (use the banner at the top), then create staff logins.",
          );
        }
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        throw new Error(msg || "Failed to create staff login");
      }
      setCreateResult(data as CreatedMemberResult);
      await loadTeamData();
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create staff login",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const handleRemoveMember = async (member: ActiveMember) => {
    if (readOnly || !canManageTeam || !member.email) return;
    setMemberBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/team/removemember`, {
        method: "DELETE",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({ email: member.email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to remove member");
      }
      toast.success(`${member.name} was removed from the team`);
      await loadTeamData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      {/* 🟢 HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Team Management
          </h2>
          <p className="text-sm text-slate-500">
            Invite staff, manage roles, and monitor access.
          </p>
        </div>

        {/* Buttons right next to each other */}
        <div className="flex items-center gap-3">
          <button
            data-testid="team-create-open"
            onClick={openCreate}
            disabled={readOnly || !canManageTeam}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <UserCog className="w-4 h-4" /> Create staff login
          </button>
          <button
            data-testid="team-invite-open"
            onClick={() => setIsInviteOpen(true)}
            disabled={readOnly}
            title={
              readOnly
                ? "Subscription expired. System is in read-only mode."
                : undefined
            }
            className={`flex items-center justify-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm shadow-blue-200 disabled:opacity-60 ${
              readOnly
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
            }`}
          >
            <UserPlus className="w-4 h-4" /> {readOnly ? "Read-only" : "Invite Staff"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 🟢 RBAC INFO BOX */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Role Definitions:</strong> Owners have full access, can delete
          records, and see total revenue. Managers can view reports but cannot
          delete workspaces. Staff can only create orders and process payments.
        </p>
      </div>

      {/* ==========================================
          UNIFIED TEAM TABLE
      ========================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 🟢 SUB-TABS (Toggle Active vs Pending) */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 pt-4 flex gap-6">
          <button
            data-testid="team-tab-active"
            onClick={() => setViewState("active")}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors -mb-px ${
              viewState === "active"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Active Members ({activeMembers.filter((m) => !m.deactivatedAt).length})
          </button>

          <button
            data-testid="team-tab-pending"
            onClick={() => setViewState("pending")}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors -mb-px flex items-center gap-2 ${
              viewState === "pending"
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Pending Invites
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${viewState === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}
            >
              {pending.length}
            </span>
          </button>
        </div>

        <div className="overflow-x-auto min-h-[250px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            {/* 🟢 ACTIVE MEMBERS VIEW */}
            {viewState === "active" && (
              <>
                <thead className="border-b border-slate-100 text-slate-500 bg-white">
                  <tr>
                    <th className="px-5 py-3 font-medium">User Details</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-700">
                  {loading && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-12 text-center text-slate-500 text-sm"
                      >
                        Loading active members...
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    activeMembers.map((user) => (
                      <tr
                        key={user.id}
                        data-testid="team-member-row"
                        className={`hover:bg-slate-50 transition-colors ${
                          user.deactivatedAt ? "opacity-70" : ""
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">
                              {user.name}
                            </span>
                            <span className="text-xs text-slate-500">
                              {user.email || user.username}
                            </span>
                            <span
                              data-testid="team-member-activity"
                              className="text-[11px] text-slate-400"
                            >
                              {formatLastActive(user.lastActiveAt)} ·{" "}
                              {user.activeSessions} active session
                              {user.activeSessions === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {user.deactivatedAt && (
                            <span
                              data-testid="team-member-deactivated"
                              className="mr-2 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider bg-rose-100 text-rose-700"
                            >
                              DEACTIVATED
                            </span>
                          )}
                          {/* Static Badge in the Role Column */}
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${
                              user.role === "OWNER"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {user.isOwner ? (
                            <span className="text-xs font-medium text-slate-400 italic pr-2">
                              Cannot edit owner
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {/* 🟢 MOVED: Change Role Dropdown inside Actions */}
                              <div className="relative">
                                <select
                                  data-testid="team-member-role-select"
                                  value={user.role}
                                  disabled={
                                    readOnly ||
                                    !canManageTeam ||
                                    memberBusy ||
                                    isSelf(user)
                                  }
                                  onChange={(e) => {
                                    if (e.target.value !== user.role) {
                                      setPendingRoleChange({
                                        member: user,
                                        role: e.target.value,
                                      });
                                    }
                                  }}
                                  className="bg-white border border-slate-200 text-slate-700 py-1.5 pl-3 pr-7 rounded-md text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="STAFF">Change to STAFF</option>
                                  <option value="MANAGER">
                                    Change to MANAGER
                                  </option>
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-2 text-slate-400 pointer-events-none" />
                              </div>

                              <button
                                data-testid="team-member-reset-password"
                                onClick={() => {
                                  setResetTarget(user);
                                  setResetPassword("");
                                  setResetError(null);
                                }}
                                disabled={
                                  readOnly ||
                                  !canManageTeam ||
                                  memberBusy ||
                                  isSelf(user)
                                }
                                title="Set a new password"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors text-xs font-semibold border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <KeyRound className="w-3.5 h-3.5" /> Reset password
                              </button>

                              <button
                                data-testid="team-member-signout"
                                onClick={() => setSignOutTarget(user)}
                                disabled={
                                  readOnly ||
                                  !canManageTeam ||
                                  memberBusy ||
                                  isSelf(user) ||
                                  user.activeSessions === 0
                                }
                                title="Sign out of every device"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors text-xs font-semibold border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <LogOut className="w-3.5 h-3.5" /> Sign out
                              </button>

                              {user.deactivatedAt ? (
                                <button
                                  data-testid="team-member-reactivate"
                                  onClick={() =>
                                    void runMemberAction(
                                      user,
                                      "reactivate",
                                      `${user.name} can sign in again`,
                                    )
                                  }
                                  disabled={readOnly || !canManageTeam || memberBusy}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors text-xs font-semibold border border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <UserCheck className="w-3.5 h-3.5" /> Reactivate
                                </button>
                              ) : (
                                <button
                                  data-testid="team-member-deactivate"
                                  onClick={() => setDeactivateTarget(user)}
                                  disabled={
                                    readOnly ||
                                    !canManageTeam ||
                                    memberBusy ||
                                    isSelf(user)
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-amber-700 hover:bg-amber-50 rounded-md transition-colors text-xs font-semibold border border-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <UserX className="w-3.5 h-3.5" /> Deactivate
                                </button>
                              )}

                              {user.email && (
                              <button
                                data-testid="team-member-revoke"
                                onClick={() => setRevokeMember(user)}
                                disabled={
                                  readOnly ||
                                  !canManageTeam ||
                                  memberBusy ||
                                  isSelf(user)
                                }
                                className="flex items-center gap-1.5 px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors text-xs font-semibold border border-transparent hover:border-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Revoke
                              </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  {!loading && activeMembers.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-12 text-center text-slate-500 text-sm"
                      >
                        No active members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </>
            )}

            {/* 🟢 PENDING INVITES VIEW */}
            {viewState === "pending" && (
              <>
                <thead className="border-b border-slate-100 text-slate-500 bg-white">
                  <tr>
                    <th className="px-5 py-3 font-medium">Invited Email</th>
                    <th className="px-5 py-3 font-medium">Role Assigned</th>
                    <th className="px-5 py-3 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-700 bg-amber-50/10">
                  {loading && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-12 text-center text-slate-500 text-sm"
                      >
                        Loading pending invites...
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    pending.map((invite) => (
                      <tr
                        key={invite.id}
                        data-testid="team-invite-row"
                        className="hover:bg-amber-50/50 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900">
                              {invite.email}
                            </span>
                            <span className="text-xs text-amber-600">
                              Sent {invite.sentAt}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-white text-slate-600 border border-slate-200 shadow-sm">
                            {invite.role}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              data-testid="team-invite-resend"
                              onClick={() => handleResendInvite(invite.email)}
                              disabled={processing !== null}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs font-semibold border border-transparent hover:border-blue-100 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {processing?.email === invite.email &&
                              processing?.action === "resend"
                                ? "Resending..."
                                : "Resend"}
                            </button>
                            <button
                              data-testid="team-invite-cancel"
                              onClick={() => setCancelInviteEmail(invite.email)}
                              disabled={processing !== null}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-md transition-colors text-xs font-semibold border border-transparent hover:border-rose-100 bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {processing?.email === invite.email &&
                              processing?.action === "cancel"
                                ? "Canceling..."
                                : "Cancel"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                  {!loading && pending.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-12 text-center text-slate-500 text-sm"
                      >
                        No pending invitations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>

      <InviteStaffModal
        isOpen={isInviteOpen}
        onClose={() => {
          setIsInviteOpen(false);
          void loadTeamData();
        }}
        businessId={currentBusinessId}
        onInviteSuccess={() => void loadTeamData()}
      />

      <AlertDialog
        isOpen={pendingRoleChange !== null}
        title="Change Role?"
        description={
          pendingRoleChange
            ? `Change ${pendingRoleChange.member.name} (${memberLabel(pendingRoleChange.member)}) from ${pendingRoleChange.member.role} to ${pendingRoleChange.role}?`
            : ""
        }
        confirmLabel="Change Role"
        destructive={false}
        confirming={memberBusy}
        onConfirm={() => {
          const change = pendingRoleChange;
          setPendingRoleChange(null);
          if (change) {
            void handleUpdateRole(change.member, change.role);
          }
        }}
        onClose={() => setPendingRoleChange(null)}
      />

      <AlertDialog
        isOpen={revokeMember !== null}
        title="Remove Team Member?"
        description={
          revokeMember
            ? `Are you sure you want to remove ${revokeMember.name} (${memberLabel(revokeMember)}) from your team? They will lose access immediately.`
            : ""
        }
        confirmLabel="Remove Member"
        confirming={memberBusy}
        onConfirm={() => {
          const member = revokeMember;
          setRevokeMember(null);
          if (member) {
            void handleRemoveMember(member);
          }
        }}
        onClose={() => setRevokeMember(null)}
      />

      <AlertDialog
        isOpen={cancelInviteEmail !== null}
        title="Cancel Invitation?"
        description={`Are you sure you want to cancel the invitation for ${cancelInviteEmail}?`}
        confirmLabel="Cancel Invitation"
        confirming={
          processing?.action === "cancel" &&
          processing.email === cancelInviteEmail
        }
        onConfirm={() => {
          const email = cancelInviteEmail;
          setCancelInviteEmail(null);
          if (email) {
            void handleCancelInvite(email);
          }
        }}
        onClose={() => setCancelInviteEmail(null)}
      />

      <AlertDialog
        isOpen={signOutTarget !== null}
        title="Sign out everywhere?"
        description={
          signOutTarget
            ? `${signOutTarget.name} will be signed out of every device. They can sign in again with their password.`
            : ""
        }
        confirmLabel="Sign out"
        destructive={false}
        confirming={memberBusy}
        onConfirm={() => {
          const member = signOutTarget;
          setSignOutTarget(null);
          if (member) {
            void runMemberAction(
              member,
              "sign-out-all",
              `${member.name} was signed out everywhere`,
            );
          }
        }}
        onClose={() => setSignOutTarget(null)}
      />

      <AlertDialog
        isOpen={deactivateTarget !== null}
        title="Deactivate member?"
        description={
          deactivateTarget
            ? `${deactivateTarget.name} will be signed out and blocked from signing in. Their sales history stays. You can reactivate them later.`
            : ""
        }
        confirmLabel="Deactivate"
        confirming={memberBusy}
        onConfirm={() => {
          const member = deactivateTarget;
          setDeactivateTarget(null);
          if (member) {
            void runMemberAction(
              member,
              "deactivate",
              `${member.name} was deactivated`,
            );
          }
        }}
        onClose={() => setDeactivateTarget(null)}
      />

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            data-testid="team-reset-dialog"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Reset password
                </h3>
                <p className="text-sm text-slate-500">
                  New password for {resetTarget.name}. They are signed out
                  everywhere.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              data-testid="team-reset-password-input"
              type="text"
              autoComplete="off"
              minLength={8}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {resetError && (
              <p
                data-testid="team-reset-error"
                className="mt-2 text-sm text-rose-600"
              >
                {resetError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="team-reset-submit"
                disabled={memberBusy || resetPassword.length < 8}
                onClick={() => void handleResetPassword()}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {memberBusy ? "Saving..." : "Reset password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create staff login modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
          <div
            data-testid="team-create-dialog"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Create staff login
                </h3>
                <p className="text-sm text-slate-500">
                  For staff without email. They sign in with a username and the
                  password you set.
                </p>
              </div>
              <button
                type="button"
                data-testid="team-create-close"
                onClick={closeCreate}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createResult ? (
              <div
                data-testid="team-create-result"
                className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
              >
                <p className="font-semibold">
                  Login created for {createResult.member.name}.
                </p>
                <dl className="space-y-1">
                  <div>
                    <dt className="text-xs text-emerald-700">Login page</dt>
                    <dd className="break-all">{createResult.loginUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-emerald-700">Username</dt>
                    <dd
                      data-testid="team-create-result-username"
                      className="font-mono break-all"
                    >
                      {createResult.loginUsername}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-emerald-700">
                  The password is shown only in the WhatsApp message below. Share
                  it now; it cannot be viewed later.
                </p>
                <a
                  data-testid="team-create-whatsapp"
                  href={`https://wa.me/?text=${encodeURIComponent(createResult.whatsappText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="w-4 h-4" /> Share on WhatsApp
                </a>
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="team-create-done"
                    onClick={closeCreate}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateMember} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="team-create-name"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Full name
                  </label>
                  <input
                    id="team-create-name"
                    data-testid="team-create-name"
                    required
                    maxLength={100}
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ali Raza"
                  />
                </div>
                <div>
                  <label
                    htmlFor="team-create-username"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Username (login becomes username@your-shop)
                  </label>
                  <input
                    id="team-create-username"
                    data-testid="team-create-username"
                    required
                    autoCapitalize="none"
                    pattern="[A-Za-z0-9._\-]{3,30}"
                    title="3-30 characters: letters, digits, dot, underscore or dash"
                    value={createForm.username}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, username: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ali"
                  />
                </div>
                <div>
                  <label
                    htmlFor="team-create-password"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="team-create-password"
                    data-testid="team-create-password"
                    type="text"
                    autoComplete="off"
                    required
                    minLength={8}
                    maxLength={128}
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label
                    htmlFor="team-create-role"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Role
                  </label>
                  <select
                    id="team-create-role"
                    data-testid="team-create-role"
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, role: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
                </div>
                <fieldset data-testid="team-create-branches" className="space-y-2">
                  <legend className="text-xs font-semibold text-slate-600 mb-1">
                    Branch access
                  </legend>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      data-testid="team-create-all-branches"
                      checked={createForm.allBranches}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          allBranches: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    All branches
                  </label>
                  {!createForm.allBranches &&
                    branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2 pl-6 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          data-testid="team-create-branch-option"
                          checked={createForm.branchIds.includes(branch.id)}
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              branchIds: e.target.checked
                                ? [...f.branchIds, branch.id]
                                : f.branchIds.filter((id) => id !== branch.id),
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {branch.name}
                      </label>
                    ))}
                </fieldset>
                {createError && (
                  <p
                    data-testid="team-create-error"
                    className="text-sm text-rose-600"
                  >
                    {createError}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeCreate}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="team-create-submit"
                    disabled={createBusy}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  >
                    {createBusy ? "Creating..." : "Create login"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
