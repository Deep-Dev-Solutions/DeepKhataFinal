"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { FOLLOW_UP_STATUSES, FollowUpStatus, Signup, formatDate } from "./types";

export default function SignupRow({ signup, onSaved }: { signup: Signup; onSaved: (s: Signup) => void }) {
  const [status, setStatus] = useState<FollowUpStatus>(signup.followUpStatus);
  const [notes, setNotes] = useState(signup.followUpNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = status !== signup.followUpStatus || notes !== (signup.followUpNotes ?? "");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/agency/signups/${signup.businessId}`, { followUpStatus: status, followUpNotes: notes });
      onSaved({ ...signup, followUpStatus: status, followUpNotes: notes });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const meta = FOLLOW_UP_STATUSES.find((s) => s.value === status);
  const trial =
    signup.trialDaysLeft === null || signup.trialDaysLeft === undefined
      ? signup.subscriptionStatus ?? "-"
      : signup.trialDaysLeft > 0
        ? `${signup.trialDaysLeft} days left`
        : "Trial ended";

  return (
    <tr data-testid="signup-row" data-business-id={signup.businessId} className="align-top hover:bg-slate-50 transition-colors">
      <td className="px-4 py-4">
        <Link href={`/tenants/${signup.businessId}`} className="font-medium text-indigo-700 hover:underline">
          {signup.businessName}
        </Link>
        <div className="text-xs text-slate-500">
          {[signup.city, signup.market].filter(Boolean).join(" - ") || "-"}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="font-medium text-slate-900">{signup.ownerName}</div>
        <div className="text-xs text-slate-500">{signup.ownerEmail}</div>
        {signup.phone && <div className="text-xs text-slate-500">{signup.phone}</div>}
      </td>
      <td className="px-4 py-4 text-slate-500 text-xs">
        <div>{formatDate(signup.createdAt)}</div>
        <div>{signup.source ?? "-"}</div>
      </td>
      <td className="px-4 py-4 text-xs text-slate-600">{trial}</td>
      <td className="px-4 py-4">
        <select
          value={status}
          data-testid="signup-status-select"
          onChange={(e) => setStatus(e.target.value as FollowUpStatus)}
          className={`px-2 py-1.5 border rounded-lg text-xs font-semibold ${meta?.badge ?? ""}`}
        >
          {FOLLOW_UP_STATUSES.map((s) => (
            <option key={s.value} value={s.value} className="bg-white text-slate-900">
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-4">
        <textarea
          value={notes}
          rows={2}
          data-testid="signup-notes"
          onChange={(e) => setNotes(e.target.value)}
          className="w-64 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          placeholder="Call notes, feedback..."
        />
        {error && (
          <div role="alert" className="text-xs text-rose-600 mt-1">
            {error}
          </div>
        )}
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          data-testid="signup-save"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
      </td>
    </tr>
  );
}
