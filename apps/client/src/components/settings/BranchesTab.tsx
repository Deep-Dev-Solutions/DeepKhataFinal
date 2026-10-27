"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";
import { Branch } from "@/types/api";
import {
  GitBranch,
  MapPin,
  Phone,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  Lock,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function BranchesTab() {
  const { role, branches: authBranches, refreshUser } = useAuth();
  const { toast } = useToast();
  const readOnly = useIsReadOnly();

  const [branches, setBranches] = useState<Branch[]>(
    Array.isArray(authBranches) ? (authBranches as Branch[]) : [],
  );
  const [isLoading, setIsLoading] = useState(
    !authBranches || authBranches.length === 0,
  );

  // Edit Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Add Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [isAdding, setIsAdding] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Dialog State
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Upgrade Dialog State
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/product/getbranches`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.branches)) {
          setBranches(data.branches);
        }
      }
    } catch (err) {
      console.error("Could not fetch branches:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Array.isArray(authBranches) && authBranches.length > 0) {
      setBranches(authBranches);
      setIsLoading(false);
    } else {
      fetchBranches();
    }
  }, [authBranches, fetchBranches]);

  // Edit Handlers
  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch);
    setEditFormData({
      name: branch.name || "",
      phone: branch.phone || "",
      address: branch.location || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/settings/branch/${editingBranch.id}`,
        {
          credentials: "include",
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: editFormData.name.trim(),
            phone: editFormData.phone.trim(),
            address: editFormData.address.trim(),
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update branch");
      }

      toast.success("Branch updated successfully");
      setIsEditDialogOpen(false);
      setEditingBranch(null);
      await fetchBranches();
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "An error occurred") || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/settings/branch/${deleteTarget.id}`,
        {
          credentials: "include",
          method: "DELETE",
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete branch");
      }

      toast.success("Branch deleted. Stock preserved and detached.");
      setDeleteTarget(null);
      await fetchBranches();
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "An error occurred") || "An error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  const safeBranches = Array.isArray(branches) ? branches : [];
  const isLimitReached = safeBranches.length >= 2 && role !== "SUPER_ADMIN";

  // Add Handlers
  const openAddDialog = () => {
    if (isLimitReached) {
      setIsUpgradeDialogOpen(true);
      return;
    }
    setModalError(null);
    setAddFormData({ name: "", phone: "", address: "" });
    setIsAddDialogOpen(true);
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) {
      setModalError(
        "Base plan limit reached (2 branches). Contact administration to upgrade.",
      );
      setIsAddDialogOpen(false);
      setIsUpgradeDialogOpen(true);
      return;
    }

    if (!addFormData.name.trim()) {
      setModalError("Branch name is required");
      return;
    }

    setIsAdding(true);
    setModalError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/settings/branch`, {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: addFormData.name.trim(),
          phone: addFormData.phone.trim(),
          address: addFormData.address.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg =
          data.message ||
          "Base plan limit reached (2 branches). Contact administration to upgrade.";
        setModalError(errorMsg);

        // Catch tier limit / payment required error
        if (
          res.status === 403 ||
          data.message?.toLowerCase().includes("limit") ||
          data.message?.toLowerCase().includes("upgrade")
        ) {
          toast.warning(errorMsg);
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      toast.success("Branch added successfully!");
      setIsAddDialogOpen(false);
      setAddFormData({ name: "", phone: "", address: "" });
      setModalError(null);
      await fetchBranches();
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error ? err.message : "An error occurred while creating branch") || "An error occurred while creating branch";
      setModalError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="border-b border-border bg-gray-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-subtitle font-semibold text-gray-900 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-brand-700" />
                Branches & Locations
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-caption font-semibold ${
                  isLimitReached
                    ? "bg-warning-bg text-warning border border-warning"
                    : "bg-gray-200/80 text-gray-700"
                }`}
              >
                {safeBranches.length} / 2 Base Plan
              </span>
            </div>
            <p className="text-caption text-gray-500 mt-1">
              Manage your business branches. Your base plan includes up to 2
              active locations.
            </p>
          </div>

          {isLimitReached ? (
            <button
              onClick={() => setIsUpgradeDialogOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-warning-bg hover:bg-warning-bg text-warning border border-warning rounded-lg text-caption font-semibold transition-all shadow-xs shrink-0 cursor-pointer"
              title="Base plan limit reached (2 branches). Click to upgrade."
            >
              <Lock className="w-3.5 h-3.5 text-warning" />
              Limit Reached (2/2)
            </button>
          ) : (
            <button
              onClick={openAddDialog}
              disabled={readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-caption font-semibold transition-all shadow-xs shrink-0 ${
                readOnly
                  ? "bg-gray-300 text-white cursor-not-allowed"
                  : "bg-brand-700 hover:bg-brand-700 text-white cursor-pointer"
              }`}
            >
              <Plus className="w-4 h-4" />
              {readOnly ? "Read-only" : "Add Branch"}
            </button>
          )}
        </div>

        {/* Tier Limit Notice Banner when 2 branches reached */}
        {isLimitReached && (
          <div className="mx-5 mt-4 p-4 rounded-lg bg-warning-bg border border-warning flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-warning">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 bg-warning-bg rounded-lg text-warning shrink-0 mt-0.5 sm:mt-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-body text-warning">
                  Base Plan Limit Reached (2/2 Locations Active)
                </p>
                <p className="text-caption text-warning mt-0.5">
                  Your current Base Plan includes up to 2 branch locations.
                  Upgrade your subscription to provision additional branches.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsUpgradeDialogOpen(true)}
              className="px-3.5 py-1.5 bg-warning hover:bg-warning text-white rounded-lg text-caption font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              Upgrade Plan
            </button>
          </div>
        )}

        <div className="p-5">
          {isLoading ? (
            <div className="flex justify-center items-center py-12 text-gray-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-brand-700" />
              <span className="text-body font-medium">Loading branches...</span>
            </div>
          ) : safeBranches.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-body">
              <GitBranch className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-700">No branches found</p>
              <p className="text-caption text-gray-400 mt-0.5">
                Click &quot;Add Branch&quot; above to create your location.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {safeBranches.map((b: Branch) => (
                <div
                  key={b.id}
                  className="border border-border rounded-lg p-4 shadow-sm hover:border-gray-300 transition-all bg-card flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 text-base truncate">
                          {b.name}
                        </h3>
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-brand-50 text-brand-700 text-caption font-semibold rounded-md border border-brand-200">
                          Active Branch
                        </span>
                      </div>
                      <button
                        onClick={() => openEditDialog(b)}
                        disabled={readOnly}
                        title={
                          readOnly
                            ? "Subscription expired. System is in read-only mode."
                            : "Edit Branch"
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-semibold rounded-lg transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                          readOnly
                            ? "text-gray-400 bg-gray-100 border border-border"
                            : "text-brand-700 hover:text-brand-700 bg-brand-50 hover:bg-brand-50 border border-brand-200 cursor-pointer"
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      {safeBranches.length > 1 && (
                        <button
                          onClick={() => setDeleteTarget(b)}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-semibold text-danger hover:text-danger bg-danger-bg hover:bg-danger-bg border border-danger rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          title="Delete Branch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 text-body text-gray-600 mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate text-caption font-mono">
                          {b.phone ? (
                            b.phone
                          ) : (
                            <span className="text-gray-400 italic">
                              No phone provided
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <span
                          className="truncate text-caption"
                          title={b.location || "No address provided"}
                        >
                          {b.location ? (
                            b.location
                          ) : (
                            <span className="text-gray-400 italic">
                              No address provided
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── DELETE BRANCH CONFIRM DIALOG ─── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this branch?"
        description={
          <>
            <span className="font-semibold text-gray-800">
              &quot;{deleteTarget?.name}&quot;
            </span>{" "}
            will be permanently removed, along with all cabinets inside it.
            Physical stock is preserved but detached, and can be moved to
            another branch afterwards. This cannot be undone.
          </>
        }
        confirmLabel="Delete Branch"
        loading={isDeleting}
        onConfirm={() => void handleDeleteBranch()}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />

      {/* ─── ADD BRANCH DIALOG ─── */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setModalError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand-700" />
              Add New Branch
            </DialogTitle>
            <DialogDescription>
              Create a new branch location for your store (up to 2 on the Base
              Plan).
            </DialogDescription>
          </DialogHeader>

          {modalError && (
            <div className="mt-1 p-3.5 rounded-lg bg-warning-bg border border-warning text-warning flex items-start gap-3 text-caption shadow-xs">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-warning text-body">Action Blocked</p>
                <p className="text-warning mt-0.5 leading-relaxed font-medium">
                  {modalError}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleAddBranch} className="space-y-4 py-2">
            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Branch Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={addFormData.name}
                onChange={(e) => {
                  setModalError(null);
                  setAddFormData({ ...addFormData, name: e.target.value });
                }}
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 font-medium"
                placeholder="e.g. Liberty Branch"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  value={addFormData.phone}
                  onChange={(e) => {
                    setModalError(null);
                    setAddFormData({ ...addFormData, phone: e.target.value });
                  }}
                  className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 pl-9 font-mono font-medium"
                  placeholder="e.g. +92 300 1234567"
                />
              </div>
            </div>

            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Address / Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <textarea
                  rows={2}
                  value={addFormData.address}
                  onChange={(e) => {
                    setModalError(null);
                    setAddFormData({
                      ...addFormData,
                      address: e.target.value,
                    });
                  }}
                  className="min-h-20 w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 px-2.5 py-1.5 pl-9 font-medium resize-none"
                  placeholder="e.g. Shop #12, Liberty Market, Lahore"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button
                type="button"
                onClick={() => setIsAddDialogOpen(false)}
                className="px-4 py-2 text-body font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding || !addFormData.name.trim() || readOnly}
                title={
                  readOnly
                    ? "Subscription expired. System is in read-only mode."
                    : undefined
                }
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 ${
                  readOnly
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-brand-700 hover:bg-brand-700 text-white cursor-pointer"
                }`}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                {isAdding ? "Adding..." : readOnly ? "Read-only" : "Add Branch"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── UPGRADE / LIMIT REACHED DIALOG ─── */}
      <Dialog open={isUpgradeDialogOpen} onOpenChange={setIsUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-lg bg-warning-bg border border-warning flex items-center justify-center mx-auto mb-2 text-warning">
              <Lock className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-subtitle font-semibold text-gray-900">
              Base Plan Limit Reached
            </DialogTitle>
            <DialogDescription className="text-center text-gray-600 text-caption mt-1">
              Your current subscription includes up to 2 branch locations and 5
              user accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3.5 rounded-lg bg-gray-50 border border-border space-y-2">
              <div className="flex justify-between items-center text-caption">
                <span className="text-gray-500 font-medium">
                  Current Branches
                </span>
                <span className="font-semibold text-gray-900">
                  {safeBranches.length} / 2 Used
                </span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div className="bg-warning h-full w-full rounded-full" />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-warning-bg/80 border border-warning/80 text-warning text-caption space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-warning" />
                Unlock Multi-Branch Expansion
              </p>
              <p className="text-warning leading-relaxed">
                Need more branches or team members? Contact administration to
                upgrade your plan for isolated branch inventory, advanced
                reporting, and additional locations.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2 sm:justify-between flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setIsUpgradeDialogOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-body font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
            <a
              href="mailto:support@bizflow.com?subject=Upgrade%20Tier%20Request%20-%20Additional%20Branches"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-700 text-white text-body font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              Contact Administration
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT BRANCH DIALOG ─── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-brand-700" />
              Edit Branch
            </DialogTitle>
            <DialogDescription>
              Update your branch details and contact information. Changes will
              reflect across your workspace.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdate} className="space-y-4 py-2">
            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Branch Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={editFormData.name}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, name: e.target.value })
                }
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 font-medium"
                placeholder="e.g. Main Branch"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, phone: e.target.value })
                  }
                  className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 pl-9 font-mono font-medium"
                  placeholder="e.g. +92 300 0000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-caption font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Address / Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <textarea
                  rows={2}
                  value={editFormData.address}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      address: e.target.value,
                    })
                  }
                  className="min-h-20 w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 px-2.5 py-1.5 pl-9 font-medium resize-none"
                  placeholder="e.g. Shop #4, Commercial Market, Lahore"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button
                type="button"
                onClick={() => setIsEditDialogOpen(false)}
                className="px-4 py-2 text-body font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !editFormData.name.trim() || readOnly}
                title={
                  readOnly
                    ? "Subscription expired. System is in read-only mode."
                    : undefined
                }
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 ${
                  readOnly
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-brand-700 hover:bg-brand-700 text-white cursor-pointer"
                }`}
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? "Saving..." : readOnly ? "Read-only" : "Save Changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
