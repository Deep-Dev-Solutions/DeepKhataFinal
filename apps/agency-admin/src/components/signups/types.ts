export type FollowUpStatus = "NEW" | "CONTACTED" | "FEEDBACK_RECEIVED" | "CONVERTED" | "LOST";

export const FOLLOW_UP_STATUSES: { value: FollowUpStatus; label: string; badge: string }[] = [
  { value: "NEW", label: "New", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "CONTACTED", label: "Contacted", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "FEEDBACK_RECEIVED", label: "Feedback received", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "CONVERTED", label: "Converted", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "LOST", label: "Lost", badge: "bg-slate-100 text-slate-600 border-slate-200" },
];

export interface Signup {
  businessId: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  phone: string | null;
  city: string | null;
  market: string | null;
  source: string | null;
  createdAt: string;
  followUpStatus: FollowUpStatus;
  followUpNotes: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
}

export interface AgencyTask {
  id: string;
  businessId: string;
  type: "FOLLOW_UP" | "FEEDBACK_CALL" | "CONVERSION";
  status: string;
  dueAt: string | null;
  notes: string | null;
  business?: { id?: string; name?: string; businessName?: string } | null;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
