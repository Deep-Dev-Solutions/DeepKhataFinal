"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  createKhataEntry,
  karachiDatePlus,
  type KhataDirection,
} from "@/lib/khata";

interface QuickKhataModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDirection?: KhataDirection;
}

type PartyOption = { id: string; name: string; phone: string };

const DUE_CHIPS: { days: number; label: string }[] = [
  { days: 3, label: "3 din" },
  { days: 7, label: "1 hafta" },
  { days: 14, label: "2 hafte" },
  { days: 30, label: "1 mahina" },
];

const inputClass =
  "w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-900 shadow-sm";

export default function QuickKhataModal({
  isOpen,
  onClose,
  defaultDirection = "RECEIVABLE",
}: QuickKhataModalProps) {
  // Mount the form only while open: fresh state and fresh party-list cache per open.
  if (!isOpen) return null;
  return <QuickKhataForm onClose={onClose} defaultDirection={defaultDirection} />;
}

function QuickKhataForm({
  onClose,
  defaultDirection,
}: {
  onClose: () => void;
  defaultDirection: KhataDirection;
}) {
  const { activeBranchId } = useAuth();
  const { toast } = useToast();

  const [direction, setDirection] = useState<KhataDirection>(defaultDirection);
  const [partyText, setPartyText] = useState("");
  const [chosen, setChosen] = useState<PartyOption | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState<number | null>(7);
  const [customDate, setCustomDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<PartyOption[] | null>(null);
  const [vendors, setVendors] = useState<PartyOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPartyText("");
    setChosen(null);
    setPhone("");
    setAmount("");
    setDays(7);
    setCustomDate("");
    setNote("");
    setError("");
    setQuery("");
    setShowList(false);
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounce the typeahead query (250 ms).
  useEffect(() => {
    const t = setTimeout(() => setQuery(partyText.trim()), 250);
    return () => clearTimeout(t);
  }, [partyText]);

  // Lazy-load the relevant party list once per open when the user types >= 2 chars.
  useEffect(() => {
    if (query.length < 2) return;
    const isLena = direction === "RECEIVABLE";
    if ((isLena ? customers : vendors) !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          isLena
            ? `${API_BASE_URL}/customer/getallcustomers`
            : `${API_BASE_URL}/vendors`,
          { headers: getAuthHeaders(activeBranchId) },
        );
        const data = await res.json();
        if (!res.ok) throw new Error("load failed");
        const rows: PartyOption[] = isLena
          ? (data?.customers ?? []).map(
              (c: { id: string; name: string; phone?: string }) => ({
                id: c.id,
                name: c.name,
                phone: c.phone ?? "",
              }),
            )
          : (data?.vendors ?? []).map(
              (v: {
                id: string;
                businessName?: string;
                name?: string;
                phone?: string | null;
              }) => ({
                id: v.id,
                name: v.businessName ?? v.name ?? "",
                phone: v.phone ?? "",
              }),
            );
        if (cancelled) return;
        if (isLena) setCustomers(rows);
        else setVendors(rows);
      } catch {
        if (cancelled) return;
        // Typeahead is best-effort; fall back to an empty list (OTHER party).
        if (isLena) setCustomers([]);
        else setVendors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, direction, customers, vendors, activeBranchId]);

  const suggestions = useMemo(() => {
    if (chosen || query.length < 2) return [];
    const list = direction === "RECEIVABLE" ? customers : vendors;
    const q = query.toLowerCase();
    return (list ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [chosen, query, direction, customers, vendors]);

  const switchDirection = (d: KhataDirection) => {
    if (d === direction) return;
    setDirection(d);
    setChosen(null);
    setPartyText("");
    setPhone("");
    setQuery("");
    setShowList(false);
    setTimeout(() => amountRef.current?.focus(), 0);
  };

  const choose = (p: PartyOption) => {
    setChosen(p);
    setPartyText(p.name);
    setPhone(p.phone);
    setShowList(false);
    setTimeout(() => amountRef.current?.focus(), 0);
  };

  const dueDate = customDate || (days !== null ? karachiDatePlus(days) : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError("");

    const value = Number(amount);
    const name = partyText.trim();
    if (!name) return setError("Party ka naam likhein.");
    if (!value || value <= 0) return setError("Sahi amount likhein.");
    if (!dueDate) return setError("Due date chunein.");

    setSaving(true);
    try {
      await createKhataEntry(activeBranchId ?? null, {
        direction,
        partyType: chosen
          ? direction === "RECEIVABLE"
            ? "CUSTOMER"
            : "VENDOR"
          : "OTHER",
        ...(chosen
          ? direction === "RECEIVABLE"
            ? { customerId: chosen.id }
            : { vendorId: chosen.id }
          : { partyName: name }),
        ...(phone.trim() ? { partyPhone: phone.trim() } : {}),
        amount: value,
        dueDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success("Entry saved");
      window.dispatchEvent(new CustomEvent("dues:changed"));
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const dirBtn = (active: boolean) =>
    `flex-1 px-3 py-2 text-sm font-bold rounded-lg transition-colors ${
      active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        data-testid="quick-khata-modal"
        role="dialog"
        aria-modal="true"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Quick Khata</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lena ya dena ki entry foran likhein.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              data-testid="quick-khata-dir-lena"
              onClick={() => switchDirection("RECEIVABLE")}
              className={dirBtn(direction === "RECEIVABLE")}
            >
              Lena (mujhe milne hain)
            </button>
            <button
              type="button"
              data-testid="quick-khata-dir-dena"
              onClick={() => switchDirection("PAYABLE")}
              className={dirBtn(direction === "PAYABLE")}
            >
              Dena (mujhe dene hain)
            </button>
          </div>

          <div className="relative">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {direction === "RECEIVABLE" ? "Kis se lena hai" : "Kisko dena hai"}
            </label>
            <input
              type="text"
              data-testid="quick-khata-party"
              autoComplete="off"
              value={partyText}
              onChange={(e) => {
                setPartyText(e.target.value);
                setChosen(null);
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              placeholder="Naam likhein"
              className={inputClass}
            />
            {showList && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      data-testid="quick-khata-party-option"
                      onClick={() => choose(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      {p.phone && (
                        <span className="text-xs text-slate-400">{p.phone}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-semibold text-sm">
                  Rs.
                </span>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  autoFocus
                  data-testid="quick-khata-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} pl-10 font-bold`}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Phone (optional)
              </label>
              <input
                type="tel"
                data-testid="quick-khata-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03xx..."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Wapsi ki tareekh
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {DUE_CHIPS.map((c) => {
                const active = !customDate && days === c.days;
                return (
                  <button
                    key={c.days}
                    type="button"
                    data-testid="quick-khata-due-chip"
                    data-days={c.days}
                    onClick={() => {
                      setDays(c.days);
                      setCustomDate("");
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-colors ${
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
              <input
                type="date"
                data-testid="quick-khata-due-date"
                value={customDate || dueDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (!e.target.value) setDays(7);
                }}
                className="ml-auto px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Note (optional)
            </label>
            <input
              type="text"
              data-testid="quick-khata-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <div
              data-testid="quick-khata-error"
              className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600 font-medium flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="quick-khata-submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
