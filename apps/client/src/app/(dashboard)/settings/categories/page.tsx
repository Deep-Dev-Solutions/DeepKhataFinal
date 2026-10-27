"use client";

import { useState, useEffect } from "react";
import {
  Archive,
  Tag,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  X,
  Package,
  Pencil,
  Layers,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useAuth } from "@/context/AuthContext";

type CategoryRow = {
  id: string;
  name: string;
  _count: { products: number };
};

export default function CategoriesSettingsPage() {
  const { activeBranchId } = useAuth();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const refreshCategories = async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/getcategories`, {
        credentials: "include",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load categories");
      }
      setCategories(data.categories || []);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load categories",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshCategories();
  }, [activeBranchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setPageError("Category name is required.");
      return;
    }

    setIsSaving(true);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/addcategory`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to create category");
      }
      setSuccessMsg(`Category "${name}" created.`);
      setNewName("");
      await refreshCategories();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to create category",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (cat: CategoryRow) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleUpdate = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setPageError("Category name is required.");
      return;
    }

    setIsSavingEdit(true);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/category/${id}`,
        {
          credentials: "include",
          method: "PATCH",
          headers: getAuthHeaders(activeBranchId),
          body: JSON.stringify({ name }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to update category");
      }
      setSuccessMsg(`Category renamed to "${name}".`);
      cancelEdit();
      await refreshCategories();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to update category",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/category/${id}`,
        {
          credentials: "include",
          method: "DELETE",
          headers: getAuthHeaders(activeBranchId),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to delete category");
      }
      setSuccessMsg(
        data?.message ||
          "Category deleted. Its products are now uncategorized.",
      );
      await refreshCategories();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to delete category",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const input =
    "w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1";

  return (
    <div className="mt-1 space-y-4 animate-in pb-12 fade-in duration-300">
      <PageHeader
        title="Product Categories"
        subtitle="Full CRUD hub for the categories used across the POS and product creation forms — managed directly from the database."
      />

      {successMsg && (
        <div className="p-3.5 bg-success-bg border border-success/30 rounded-lg flex items-center gap-2 text-body font-semibold text-success shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          {successMsg}
        </div>
      )}

      {pageError && (
        <div className="p-3.5 bg-danger-bg border border-danger/30 rounded-lg flex items-center justify-between text-body font-semibold text-danger shadow-sm animate-in fade-in">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
            {pageError}
          </span>
          <button
            onClick={() => setPageError("")}
            className="text-danger hover:text-danger font-semibold cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* CREATE FORM */}
        <form
          onSubmit={handleCreate}
          className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-4"
        >
          <h3 className="flex items-center gap-1.5 text-subtitle font-semibold text-gray-900">
            <Layers className="w-3.5 h-3.5 text-brand-700" />
            Create New Category
          </h3>

          <div>
            <label className="block text-body font-semibold text-gray-700 mb-1.5">
              Category Name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Display Screens"
              className={input}
            />
            <p className="text-caption text-gray-400 mt-1.5">
              Appears instantly in the POS category filter and the Add Product
              form.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-brand-700 text-white text-body font-semibold rounded-lg hover:bg-brand-700 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Category
                </>
              )}
            </button>
          </div>
        </form>

        {/* CATEGORY LIST */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-subtitle font-semibold text-gray-900">
              <Archive className="w-4 h-4 text-brand-700" />
              Existing Categories
              <span className="text-caption font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                {categories.length}
              </span>
            </h3>
          </div>

          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400 text-body">
                Loading categories...
              </div>
            ) : categories.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Tag className="w-8 h-8 opacity-30" />
                <p className="text-body">
                  No categories yet. Create your first one on the left.
                </p>
              </div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                >
                  {editingId === cat.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleUpdate(cat.id);
                          }
                          if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        className="flex-1 border border-brand-200 rounded-lg px-3 py-2 text-body focus:ring-2 focus:ring-brand-300 outline-none"
                      />
                      <button
                        onClick={() => void handleUpdate(cat.id)}
                        disabled={isSavingEdit}
                        className="p-2 bg-brand-700 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
                        title="Save"
                      >
                        {isSavingEdit ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-brand-50 text-brand-700 rounded-lg shrink-0">
                          <Tag className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-body font-semibold text-gray-900 truncate">
                            {cat.name}
                          </p>
                          <p className="text-caption text-gray-500 flex items-center gap-1">
                            <Package className="w-3 h-3 shrink-0" />
                            {cat._count?.products ?? 0} product(s) linked
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(cat)}
                          className="p-2 text-gray-400 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                          title="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setDeleteTarget({ id: cat.id, name: cat.name })
                          }
                          disabled={deletingId === cat.id}
                          className="p-2 text-gray-400 hover:text-danger hover:bg-danger-bg rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                          title="Delete (products become uncategorized)"
                        >
                          {deletingId === cat.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete category?"
          description={
            <>
              <span className="font-semibold text-gray-800">
                &quot;{deleteTarget?.name}&quot;
              </span>{" "}
              will be permanently deleted. Products using it will become{" "}
              <span className="font-semibold text-gray-800">Uncategorized</span>.
              This cannot be undone.
            </>
          }
          confirmLabel="Delete Category"
          loading={deletingId === deleteTarget?.id}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target) {
              void handleDelete(target.id);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}