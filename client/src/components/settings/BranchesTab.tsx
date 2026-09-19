"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
import { GitBranch, MapPin, Phone, Pencil, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function BranchesTab() {
  const { branches: authBranches, token, refreshUser } = useAuth();
  const { toast } = useToast();

  const [branches, setBranches] = useState<any[]>(
    Array.isArray(authBranches) ? authBranches : [],
  );
  const [isLoading, setIsLoading] = useState(
    !authBranches || authBranches.length === 0,
  );

  // Edit Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
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

  const fetchBranches = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/product/getbranches`, {
        headers: { Authorization: `Bearer ${token}` },
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
  }, [token]);

  useEffect(() => {
    if (Array.isArray(authBranches) && authBranches.length > 0) {
      setBranches(authBranches);
      setIsLoading(false);
    } else {
      fetchBranches();
    }
  }, [authBranches, fetchBranches]);

  // Edit Handlers
  const openEditDialog = (branch: any) => {
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
    if (!editingBranch || !token) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/settings/branch/${editingBranch.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  // Add Handlers
  const openAddDialog = () => {
    setAddFormData({ name: "", phone: "", address: "" });
    setIsAddDialogOpen(true);
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!addFormData.name.trim()) {
      toast.error("Branch name is required");
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/settings/branch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: addFormData.name.trim(),
          phone: addFormData.phone.trim(),
          address: addFormData.address.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Catch tier limit / payment required error
        if (
          res.status === 403 ||
          data.message?.toLowerCase().includes("limit") ||
          data.message?.toLowerCase().includes("upgrade")
        ) {
          toast.warning(
            data.message ||
              "Base plan limit reached (2 branches). Contact administration to upgrade.",
          );
          return;
        }
        throw new Error(data.message || "Failed to add branch");
      }

      toast.success("Branch added successfully!");
      setIsAddDialogOpen(false);
      setAddFormData({ name: "", phone: "", address: "" });
      await fetchBranches();
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred while creating branch");
    } finally {
      setIsAdding(false);
    }
  };

  const safeBranches = Array.isArray(branches) ? branches : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-indigo-600" />
                Branches & Locations
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200/80 text-slate-700">
                {safeBranches.length} / 2 Base Plan
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Manage your business branches. Your base plan includes up to 2
              active locations.
            </p>
          </div>

          <button
            onClick={openAddDialog}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex justify-center items-center py-12 text-slate-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-sm font-medium">Loading branches...</span>
            </div>
          ) : safeBranches.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <GitBranch className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No branches found</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Click "Add Branch" above to create your location.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {safeBranches.map((b: any) => (
                <div
                  key={b.id}
                  className="border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-all bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-base truncate">
                          {b.name}
                        </h3>
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] font-semibold rounded-md border border-indigo-100">
                          Active Branch
                        </span>
                      </div>
                      <button
                        onClick={() => openEditDialog(b)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Edit Branch"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </div>

                    <div className="space-y-2 text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate text-xs font-mono">
                          {b.phone ? (
                            b.phone
                          ) : (
                            <span className="text-slate-400 italic">
                              No phone provided
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <span
                          className="truncate text-xs"
                          title={b.location || "No address provided"}
                        >
                          {b.location ? (
                            b.location
                          ) : (
                            <span className="text-slate-400 italic">
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

      {/* ─── ADD BRANCH DIALOG ─── */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Add New Branch
            </DialogTitle>
            <DialogDescription>
              Create a new branch location for your store (up to 2 on the Base
              Plan).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddBranch} className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Branch Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={addFormData.name}
                onChange={(e) =>
                  setAddFormData({ ...addFormData, name: e.target.value })
                }
                className="w-full px-3 h-10 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs"
                placeholder="e.g. Liberty Branch"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  value={addFormData.phone}
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, phone: e.target.value })
                  }
                  className="w-full pl-9 pr-3 h-10 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs font-mono"
                  placeholder="e.g. +92 300 1234567"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Address / Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <textarea
                  rows={2}
                  value={addFormData.address}
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, address: e.target.value })
                  }
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs resize-none"
                  placeholder="e.g. Shop #12, Liberty Market, Lahore"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button
                type="button"
                onClick={() => setIsAddDialogOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding || !addFormData.name.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                {isAdding ? "Adding..." : "Add Branch"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT BRANCH DIALOG ─── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-600" />
              Edit Branch
            </DialogTitle>
            <DialogDescription>
              Update your branch details and contact information. Changes will
              reflect across your workspace.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdate} className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Branch Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editFormData.name}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, name: e.target.value })
                }
                className="w-full px-3 h-10 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs"
                placeholder="e.g. Main Branch"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, phone: e.target.value })
                  }
                  className="w-full pl-9 pr-3 h-10 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs font-mono"
                  placeholder="e.g. +92 300 0000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Address / Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <textarea
                  rows={2}
                  value={editFormData.address}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      address: e.target.value,
                    })
                  }
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs resize-none"
                  placeholder="e.g. Shop #4, Commercial Market, Lahore"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button
                type="button"
                onClick={() => setIsEditDialogOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !editFormData.name.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
