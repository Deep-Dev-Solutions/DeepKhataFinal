"use client";

import { useState, useEffect } from "react";
import {
  MapPin,
  Layers,
  CheckCircle2,
  AlertCircle,
  Archive,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

type CabinetRow = {
  id: string;
  name: string;
  location: string | null;
  _count: { instances: number };
};

export default function CabinetsSettingsPage() {
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

  const refreshCabinets = async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/getcabinets`, {
        headers: getAuthHeaders(),
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
  }, []);

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

    setIsSaving(true);
    setPageError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${API_BASE_URL}/product/addcabinet`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, rack, shelf, bin }),
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12 mt-2 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Archive className="w-6 h-6 text-indigo-600" />
            Spatial Cabinets
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Define the physical Rack &rarr; Shelf &rarr; Bin layout of Hafeez
            Centre so every part has a home.
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
          onSubmit={handleCreateCabinet}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            Create New Cabinet
          </h3>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Cabinet Name (Optional)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Display Rack"
              className="w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rack
              </label>
              <input
                type="text"
                value={newRack}
                onChange={(e) => setNewRack(e.target.value)}
                placeholder="e.g. A"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Shelf
              </label>
              <input
                type="text"
                value={newShelf}
                onChange={(e) => setNewShelf(e.target.value)}
                placeholder="e.g. 2"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bin
              </label>
              <input
                type="text"
                value={newBin}
                onChange={(e) => setNewBin(e.target.value)}
                placeholder="e.g. 04"
                className="w-full border border-slate-300 rounded-xl py-2 px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            If no name is given, the cabinet is auto-named from its location
            (e.g. &quot;Rack A / Shelf 2 / Bin 04&quot;).
          </p>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? "Creating..." : "Create Cabinet"}
            </button>
          </div>
        </form>

        {/* CABINET LIST */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-600" />
              Existing Cabinets
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {cabinets.length}
              </span>
            </h3>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Loading cabinets...
              </div>
            ) : cabinets.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                <MapPin className="w-8 h-8 opacity-30" />
                <p className="text-sm">
                  No cabinets yet. Create your first one on the left.
                </p>
              </div>
            ) : (
              cabinets.map((cab) => (
                <div
                  key={cab.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                      <Archive className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {cab.name}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {cab.location || "Shop Storage"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                    {cab._count?.instances ?? 0} instances
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}