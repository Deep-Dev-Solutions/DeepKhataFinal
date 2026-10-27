export type FollowUpStatus = "NEW" | "CONTACTED" | "FEEDBACK_RECEIVED" | "CONVERTED" | "LOST";

export const FOLLOW_UP_STATUSES: { value: FollowUpStatus; label: string; badge: string }[] = [
  { value: "NEW", label: "New", badge: "bg-brand-50 text-brand-700 border-brand-200" },
  { value: "CONTACTED", label: "Contacted", badge: "bg-warning-bg text-warning border-warning" },
  { value: "FEEDBACK_RECEIVED", label: "Feedback received", badge: "bg-brand-50 text-brand-700 border-brand-200" },
  { value: "CONVERTED", label: "Converted", badge: "bg-success-bg text-success border-success" },
  { value: "LOST", label: "Lost", badge: "bg-gray-100 text-gray-600 border-gray-200" },
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
