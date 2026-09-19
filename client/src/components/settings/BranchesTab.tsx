"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
import { GitBranch, MapPin, Phone, Pencil, Loader2 } from "lucide-react";
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [isSaving, setIsSaving] = useState(false);

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

  const openEditDialog = (branch: any) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name || "",
      phone: branch.phone || "",
      address: branch.location || "",
    });
    setIsDialogOpen(true);
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
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            address: formData.address.trim(),
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update branch");
      }

      toast.success("Branch updated successfully");
      setIsDialogOpen(false);
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

  const safeBranches = Array.isArray(branches) ? branches : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 pt-4 pb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-indigo-600" />
            Branches & Locations
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            View and manage your provisioned branches. New branches can only be
            added by DeepKhata administration.
          </p>
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
                Contact administration to provision your first branch.
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

      {/* Standard Shadcn Dialog for Editing Branch */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-600" />
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
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
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
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
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
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none shadow-xs resize-none"
                  placeholder="e.g. Shop #4, Commercial Market, Lahore"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !formData.name.trim()}
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
