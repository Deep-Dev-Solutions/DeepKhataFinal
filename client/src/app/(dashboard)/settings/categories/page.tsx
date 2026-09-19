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
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import AlertDialog from "@/components/ui/alert-dialog";

type CategoryRow = {
  id: string;
  name: string;
  _count: { products: number };
};

export default function CategoriesSettingsPage() {
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
        headers: getAuthHeaders(),
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
  }, []);

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
        method: "POST",
        headers: getAuthHeaders(),
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
        `${API_BASE_URL}/product/category/${id}`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
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
        `${API_BASE_URL}/product/category/${id}/delete`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to delete category");
      }
      setSuccessMsg(
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
    "w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none";

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12 mt-2 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-indigo-600" />
            Product Categories
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Full CRUD hub for the categories used across the POS and product
            creation forms — managed directly from the database.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm font-bold text-emerald-800 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {pageError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-sm font-semibold text-rose-800 shadow-sm animate-in fade-in">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            {pageError}
          </span>
          <button
            onClick={() => setPageError("")}
            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* CREATE FORM */}
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            Create New Category
          </h3>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Category Name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Display Screens"
              className={input}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Appears instantly in the POS category filter and the Add Product
              form.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-600" />
              Existing Categories
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {categories.length}
              </span>
            </h3>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Loading categories...
              </div>
            ) : categories.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Tag className="w-8 h-8 opacity-30" />
                <p className="text-sm">
                  No categories yet. Create your first one on the left.
                </p>
              </div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
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
                        className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        onClick={() => void handleUpdate(cat.id)}
                        disabled={isSavingEdit}
                        className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
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
                        className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                          <Tag className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {cat.name}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Package className="w-3 h-3 shrink-0" />
                            {cat._count?.products ?? 0} product(s) linked
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(cat)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setDeleteTarget({ id: cat.id, name: cat.name })
                          }
                          disabled={deletingId === cat.id}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
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

        <AlertDialog
          isOpen={deleteTarget !== null}
          title="Delete Category?"
          description={`"${deleteTarget?.name}" will be permanently deleted. Its products will become uncategorized.`}
          confirmLabel="Delete Category"
          confirming={deletingId === deleteTarget?.id}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target) {
              void handleDelete(target.id);
            }
          }}
          onClose={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}