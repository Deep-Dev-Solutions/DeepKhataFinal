"use client";

import { useState, useEffect } from "react";
import {
  MapPin,
  Layers,
  CheckCircle2,
  AlertCircle,
  Archive,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useAuth } from "@/context/AuthContext";
import { useIsReadOnly } from "@/hooks/useIsReadOnly";

type CabinetRow = {
  id: string;
  name: string;
  location: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  _count: { instances: number };
};

export default function CabinetsSettingsPage() {
  const { activeBranchId } = useAuth();
  const readOnly = useIsReadOnly();
  const [cabinets, setCabinets] = useState<CabinetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newRack, setNewRack] = useState("");
  const [newShelf, setNewShelf] = useState("");
  const [newBin, setNewBin] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRack, setEditRack] = useState("");
  const [editShelf, setEditShelf] = useState("");
  const [editBin, setEditBin] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const refreshCabinets = async () => {
    if (!activeBranchId) return;
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/getcabinets`, {
        credentials: "include",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load cabinets");
      }
      setCabinets(data.cabinets || []);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load cabinets",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshCabinets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const handleCreateCabinet = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const rack = newRack.trim();
    const shelf = newShelf.trim();
    const bin = newBin.trim();

    if (!name && !rack && !shelf && !bin) {
      setPageError("Enter a cabinet name or a Rack / Shelf / Bin reference.");
      return;
    }

    if (!activeBranchId) {
      setPageError("Select an active branch before creating a cabinet.");
      return;
    }

    setIsSaving(true);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/cabinet`, {
        credentials: "include",
        method: "POST",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({ name, rack, shelf, bin, branchId: activeBranchId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to create cabinet");
      }
      setSuccessMsg(
        `Cabinet created: ${data.cabinet?.name || name} (${data.cabinet?.location || "Shop Storage"})`,
      );
      setNewName("");
      setNewRack("");
      setNewShelf("");
      setNewBin("");
      await refreshCabinets();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to create cabinet",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const parseLocation = (loc: string | null) => {
    const parts = (loc || "").split(" -> ").map((p) => p.trim());
    const rack = parts.find((p) => p.startsWith("Rack "))?.slice(5) || "";
    const shelf = parts.find((p) => p.startsWith("Shelf "))?.slice(6) || "";
    const bin = parts.find((p) => p.startsWith("Bin "))?.slice(4) || "";
    return { rack, shelf, bin };
  };

  const startEdit = (cab: CabinetRow) => {
    setEditingId(cab.id);
    setEditName(cab.name);
    const { rack, shelf, bin } = parseLocation(cab.location);
    setEditRack(rack);
    setEditShelf(shelf);
    setEditBin(bin);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRack("");
    setEditShelf("");
    setEditBin("");
  };

  const handleUpdateCabinet = async (id: string) => {
    setIsSavingEdit(true);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/cabinet/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: getAuthHeaders(activeBranchId),
        body: JSON.stringify({
          name: editName.trim(),
          rack: editRack.trim(),
          shelf: editShelf.trim(),
          bin: editBin.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to update cabinet");
      }
      setSuccessMsg(`Cabinet "${data.cabinet?.name || editName}" updated.`);
      cancelEdit();
      await refreshCabinets();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to update cabinet",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteCabinet = async (id: string) => {
    setDeletingId(id);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/cabinet/${id}`, {
        credentials: "include",
        method: "DELETE",
        headers: getAuthHeaders(activeBranchId),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to delete cabinet");
      }
      setSuccessMsg(
        data?.message ||
          `Cabinet deleted. All ${data?.instancesDestroyed ?? 0} stock instances inside it were destroyed.`,
      );
      await refreshCabinets();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to delete cabinet",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div data-testid="cabinets-page" className="mt-1 space-y-4 animate-in pb-12 fade-in duration-300">
      <PageHeader
        title="Spatial Cabinets"
        subtitle="Define the physical Rack &rarr; Shelf &rarr; Bin layout of Hafeez Centre so every part has a home."
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
          onSubmit={handleCreateCabinet}
          className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-4"
        >
          <h3 className="flex items-center gap-1.5 text-subtitle font-semibold text-gray-900">
            <Layers className="w-3.5 h-3.5 text-brand-700" />
            Create New Cabinet
          </h3>

          <div>
            <label className="block text-body font-semibold text-gray-700 mb-1.5">
              Cabinet Name (Optional)
            </label>
            <input
              type="text"
              data-testid="cabinet-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Display Rack"
              className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-caption font-semibold text-gray-700 mb-1">
                Rack
              </label>
              <input
                type="text"
                data-testid="cabinet-rack"
                value={newRack}
                onChange={(e) => setNewRack(e.target.value)}
                placeholder="e.g. A"
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 font-medium"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-gray-700 mb-1">
                Shelf
              </label>
              <input
                type="text"
                data-testid="cabinet-shelf"
                value={newShelf}
                onChange={(e) => setNewShelf(e.target.value)}
                placeholder="e.g. 2"
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 font-medium"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-gray-700 mb-1">
                Bin
              </label>
              <input
                type="text"
                data-testid="cabinet-bin"
                value={newBin}
                onChange={(e) => setNewBin(e.target.value)}
                placeholder="e.g. 04"
                className="w-full rounded-md border border-input bg-white text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 h-[var(--control-md)] px-2.5 py-1 font-medium"
              />
            </div>
          </div>

          <p className="text-caption text-gray-400">
            If no name is given, the cabinet is auto-named from its location
            (e.g. &quot;Rack A / Shelf 2 / Bin 04&quot;).
          </p>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
            <button
              type="submit"
              data-testid="cabinet-submit"
              disabled={isSaving || readOnly}
              title={
                readOnly
                  ? "Subscription expired. System is in read-only mode."
                  : undefined
              }
              className={`px-5 py-2.5 text-white text-body font-semibold rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 ${
                readOnly
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-brand-700 hover:bg-brand-700 cursor-pointer"
              }`}
            >
              {isSaving
                ? "Creating..."
                : readOnly
                  ? "Read-only"
                  : "Create Cabinet"}
            </button>
          </div>
        </form>

        {/* CABINET LIST */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-subtitle font-semibold text-gray-900">
              <Archive className="w-4 h-4 text-brand-700" />
              Existing Cabinets
              <span className="text-caption font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                {cabinets.length}
              </span>
            </h3>
          </div>

          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400 text-body">
                Loading cabinets...
              </div>
            ) : cabinets.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                <MapPin className="w-8 h-8 opacity-30" />
                <p className="text-body">
                  No cabinets yet. Create your first one on the left.
                </p>
              </div>
            ) : (
              cabinets.map((cab) =>
                editingId === cab.id ? (
                  <div
                    key={cab.id}
                    className="p-4 bg-brand-50"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleUpdateCabinet(cab.id);
                          }
                          if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        placeholder="Cabinet name"
                        className="flex-1 border border-brand-200 rounded-lg px-3 py-2 text-body focus:ring-2 focus:ring-brand-300 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <input
                        type="text"
                        value={editRack}
                        onChange={(e) => setEditRack(e.target.value)}
                        placeholder="Rack A"
                        className="rounded-md border border-input bg-white px-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 h-[var(--control-sm)]"
                      />
                      <input
                        type="text"
                        value={editShelf}
                        onChange={(e) => setEditShelf(e.target.value)}
                        placeholder="Shelf 2"
                        className="rounded-md border border-input bg-white px-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 h-[var(--control-sm)]"
                      />
                      <input
                        type="text"
                        value={editBin}
                        onChange={(e) => setEditBin(e.target.value)}
                        placeholder="Bin 04"
                        className="rounded-md border border-input bg-white px-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 h-[var(--control-sm)]"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        onClick={() => void handleUpdateCabinet(cab.id)}
                        disabled={isSavingEdit || readOnly}
                        title={
                          readOnly
                            ? "Subscription expired. System is in read-only mode."
                            : "Save"
                        }
                        className={`p-2 rounded-lg disabled:opacity-50 ${
                          readOnly
                            ? "bg-gray-300 text-white cursor-not-allowed"
                            : "bg-brand-700 text-white hover:bg-brand-700 cursor-pointer"
                        }`}
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
                  </div>
                ) : (
                  <div
                    key={cab.id}
                    data-testid="cabinet-row"
                    className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-brand-50 text-brand-700 rounded-lg shrink-0">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-gray-900 truncate">
                          {cab.name}
                        </p>
                        <p className="text-caption text-gray-500 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {cab.location || "Shop Storage"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-caption font-semibold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 shrink-0 mr-1">
                        {cab._count?.instances ?? 0} instances
                      </span>
                      <button
                        onClick={() => startEdit(cab)}
                        disabled={readOnly}
                        title={
                          readOnly
                            ? "Subscription expired. System is in read-only mode."
                            : "Edit cabinet"
                        }
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          readOnly
                            ? "text-gray-300"
                            : "text-gray-400 hover:text-brand-700 hover:bg-brand-50 cursor-pointer"
                        }`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: cab.id, name: cab.name })
                        }
                        data-testid="cabinet-delete"
                        disabled={deletingId === cab.id}
                        className="p-2 text-gray-400 hover:text-danger hover:bg-danger-bg rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        title="Delete cabinet (destroys stock inside)"
                      >
                        {deletingId === cab.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete this cabinet?"
          description={
            <>
              <span className="font-semibold text-gray-800">
                &quot;{deleteTarget?.name}&quot;
              </span>{" "}
              contains physical inventory. Deleting it will permanently destroy
              all stock inside it. This cannot be undone.
            </>
          }
          confirmLabel="Delete Cabinet"
          loading={deletingId === deleteTarget?.id}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target) {
              void handleDeleteCabinet(target.id);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}