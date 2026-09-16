"use client";

import { useEffect, useState } from "react";
import {
  UserPlus,
  Shield,
  Trash2,
  Mail,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import InviteStaffModal from "@/components/modals/InviteStaffModal";

type ActiveMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  sentAt: string;
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

  const loadTeamData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [activeRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE_URL}/team/activemembers`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_BASE_URL}/team/pendinginvites`, {
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

      const mappedActive = (activeData?.members || []).map(
        (member: ActiveMember, index: number) => ({
          id: member.id || `${member.email}-${index}`,
          name: member.name,
          email: member.email,
          role: member.role,
        }),
      );

      const mappedPending = (pendingData?.pendingInvites || []).map(
        (invite: any, index: number) => ({
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
    } catch (err: any) {
      setError(err?.message || "Failed to load team data");
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
    setError(null);
    setProcessing({ email, action: "resend" });
    try {
      const res = await fetch(`${API_BASE_URL}/team/resendinvite`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ email, businessId: currentBusinessId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to resend invitation");
      }
      await loadTeamData();
    } catch (err: any) {
      setError(err?.message || "Failed to resend invitation");
    } finally {
      setProcessing(null);
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (
      !confirm(`Are you sure you want to cancel the invitation for ${email}?`)
    ) {
      return;
    }
    setError(null);
    setProcessing({ email, action: "cancel" });
    try {
      const res = await fetch(`${API_BASE_URL}/team/cancelinvite`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to cancel invitation");
      }
      await loadTeamData();
    } catch (err: any) {
      setError(err?.message || "Failed to cancel invitation");
    } finally {
      setProcessing(null);
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
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
          >
            <UserPlus className="w-4 h-4" /> Invite Staff
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
            onClick={() => setViewState("active")}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors -mb-px ${
              viewState === "active"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Active Members ({activeMembers.length})
          </button>

          <button
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
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">
                              {user.name}
                            </span>
                            <span className="text-xs text-slate-500">
                              {user.email}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
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
                          {user.role === "OWNER" ? (
                            <span className="text-xs font-medium text-slate-400 italic pr-2">
                              Cannot edit owner
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {/* 🟢 MOVED: Change Role Dropdown inside Actions */}
                              <div className="relative">
                                <select className="bg-white border border-slate-200 text-slate-700 py-1.5 pl-3 pr-7 rounded-md text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none hover:bg-slate-50 transition-colors shadow-sm">
                                  <option
                                    value="STAFF"
                                    selected={user.role === "STAFF"}
                                  >
                                    Change to STAFF
                                  </option>
                                  <option
                                    value="MANAGER"
                                    selected={user.role === "MANAGER"}
                                  >
                                    Change to MANAGER
                                  </option>
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-2 text-slate-400 pointer-events-none" />
                              </div>

                              <button className="flex items-center gap-1.5 px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors text-xs font-semibold border border-transparent hover:border-rose-100">
                                <Trash2 className="w-3.5 h-3.5" /> Revoke
                              </button>
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
                              onClick={() => handleCancelInvite(invite.email)}
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
    </div>
  );
}
