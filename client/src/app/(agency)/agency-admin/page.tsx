"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/auth";
import {
  Building2,
  Users,
  ShoppingBag,
  Receipt,
  Plus,
  GitBranch,
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2,
  X,
} from "lucide-react";

interface Branch {
  id: string;
  name: string;
  location: string | null;
  createdAt: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: {
    name: string;
    email: string;
    phone: string | null;
  };
  _count: {
    users: number;
    products: number;
    orders: number;
    branches: number;
  };
  branches: Branch[];
}

export default function AgencyAdminPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New tenant form state
  const [formData, setFormData] = useState({
    businessName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    phone: "",
    address: "",
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  // Branch provisioning state
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [branchModalFor, setBranchModalFor] = useState<Tenant | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [branchSubmitLoading, setBranchSubmitLoading] = useState(false);
  const [branchError, setBranchError] = useState("");

  const fetchTenants = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/agency/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchTenants();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/agency/onboard-tenant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to onboard tenant");
      }

      await fetchTenants();
      setIsModalOpen(false);
      setFormData({
        businessName: "",
        ownerName: "",
        ownerEmail: "",
        ownerPassword: "",
        phone: "",
        address: "",
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchModalFor || !branchName.trim()) return;
    setBranchSubmitLoading(true);
    setBranchError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/agency/branch/${branchModalFor.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: branchName, location: branchLocation }),
        },
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to add branch");
      }

      await fetchTenants();
      setBranchModalFor(null);
      setBranchName("");
      setBranchLocation("");
    } catch (err: any) {
      setBranchError(err.message);
    } finally {
      setBranchSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading tenants...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tenants Overview
          </h2>
          <p className="text-slate-500 mt-1">
            Manage provisioned businesses, owners, and branches.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Provision New Tenant
        </button>
      </div>

      {/* ── Tenants Table ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Business</th>
                <th className="px-6 py-4">Owner</th>
                <th className="px-6 py-4 text-center">Users</th>
                <th className="px-6 py-4 text-center">Products</th>
                <th className="px-6 py-4 text-center">Orders</th>
                <th className="px-6 py-4 text-center">Branches</th>
                <th className="px-6 py-4">Created Date</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No tenants found. Provision one to get started.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <React.Fragment key={t.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {t.name}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              /{t.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">
                          {t.owner.name}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {t.owner.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-slate-700 font-medium text-xs">
                          <Users size={14} className="text-slate-500" />
                          {t._count.users}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-slate-700 font-medium text-xs">
                          <ShoppingBag size={14} className="text-slate-500" />
                          {t._count.products}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-slate-700 font-medium text-xs">
                          <Receipt size={14} className="text-slate-500" />
                          {t._count.orders}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium text-xs">
                          <GitBranch size={14} />
                          {t._count.branches}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBranchModalFor(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            title="Add a new branch to this business"
                          >
                            <Plus size={13} />
                            Branch
                          </button>
                          <button
                            onClick={() =>
                              setExpandedTenantId(
                                expandedTenantId === t.id ? null : t.id,
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View branches"
                          >
                            {expandedTenantId === t.id ? (
                              <ChevronUp size={15} />
                            ) : (
                              <ChevronDown size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Branch List Row ──────────────────────────────── */}
                    {expandedTenantId === t.id && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="flex flex-wrap gap-3 items-center">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Branches:
                            </span>
                            {t.branches.length === 0 ? (
                              <span className="text-xs text-slate-400">
                                No branches yet
                              </span>
                            ) : (
                              t.branches.map((b) => (
                                <div
                                  key={b.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 shadow-xs"
                                >
                                  <GitBranch
                                    size={12}
                                    className="text-indigo-500"
                                  />
                                  <span className="font-medium">{b.name}</span>
                                  {b.location && (
                                    <span className="flex items-center gap-0.5 text-slate-400 ml-1">
                                      <MapPin size={10} />
                                      {b.location}
                                    </span>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Provision New Tenant Modal ────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                Provision New Tenant
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Business Name
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.businessName}
                    onChange={(e) =>
                      setFormData({ ...formData, businessName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Owner Name
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.ownerName}
                      onChange={(e) =>
                        setFormData({ ...formData, ownerName: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Owner Email
                    </label>
                    <input
                      required
                      type="email"
                      value={formData.ownerEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, ownerEmail: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Initial Password
                    </label>
                    <input
                      required
                      type="password"
                      value={formData.ownerPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          ownerPassword: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="+92 300 0000000"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {submitLoading ? "Provisioning..." : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Branch Modal ──────────────────────────────────────────────── */}
      {branchModalFor && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50/60">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <GitBranch size={18} className="text-indigo-600" />
                  Provision New Branch
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adding to:{" "}
                  <span className="font-semibold text-slate-700">
                    {branchModalFor.name}
                  </span>
                </p>
              </div>
              <button
                onClick={() => {
                  setBranchModalFor(null);
                  setBranchError("");
                  setBranchName("");
                  setBranchLocation("");
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddBranch} className="p-6 space-y-4">
              {branchError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-100">
                  {branchError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. Gulberg Branch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Location (Optional)
                </label>
                <input
                  type="text"
                  value={branchLocation}
                  onChange={(e) => setBranchLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. 24-B, MM Alam Road, Lahore"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setBranchModalFor(null);
                    setBranchError("");
                  }}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={branchSubmitLoading || !branchName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {branchSubmitLoading && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {branchSubmitLoading ? "Adding..." : "Add Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
