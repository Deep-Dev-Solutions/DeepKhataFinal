"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePermissions } from "@/hooks/usePermissions";
import FloatingSaveBar from "./FloatingSaveBar";
import {
  RULE_META,
  TIME_RE,
  fetchNotificationSettings,
  parseOffsets,
  saveNotificationSettings,
  type NotificationSettings,
  type Recipients,
  type RuleKey,
} from "@/lib/notification-settings";

const inputCls =
  "border border-slate-300 rounded-lg py-1.5 px-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm shadow-sm disabled:bg-slate-50 disabled:text-slate-400";

function offsetsToText(v?: number[]) {
  return (v ?? []).join(", ");
}

export default function NotificationsTab() {
  const { activeBranchId } = useAuth();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("manage:notification-settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [offsetsText, setOffsetsText] = useState<Partial<Record<RuleKey, string>>>({});

  const applyLoaded = useCallback((s: NotificationSettings) => {
    setSaved(s);
    setDraft(s);
    const texts: Partial<Record<RuleKey, string>> = {};
    for (const m of RULE_META) {
      if (m.setting === "offsetsDays") texts[m.key] = offsetsToText(s.rules[m.key]?.offsetsDays);
    }
    setOffsetsText(texts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings(activeBranchId)
      .then((s) => {
        if (!cancelled) applyLoaded(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Settings load nahi hui");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, applyLoaded]);

  const effectiveDraft = useMemo(() => {
    if (!draft) return null;
    const rules = { ...draft.rules };
    for (const m of RULE_META) {
      if (m.setting === "offsetsDays" && rules[m.key]) {
        const parsed = parseOffsets(offsetsText[m.key] ?? "");
        if (parsed) rules[m.key] = { ...rules[m.key], offsetsDays: parsed };
      }
    }
    return { ...draft, rules };
  }, [draft, offsetsText]);

  const dirty = useMemo(
    () => !!saved && !!effectiveDraft && JSON.stringify(saved) !== JSON.stringify(effectiveDraft),
    [saved, effectiveDraft],
  );

  const updateRule = (key: RuleKey, patch: Partial<NotificationSettings["rules"][RuleKey]>) => {
    setDraft((d) => (d ? { ...d, rules: { ...d.rules, [key]: { ...d.rules[key], ...patch } } } : d));
  };

  const toggleWhatsapp = (key: RuleKey, on: boolean) => {
    if (!draft) return;
    const current = draft.rules[key].channels ?? ["IN_APP"];
    const without = current.filter((c) => c !== "WHATSAPP_LINK" && c !== "IN_APP");
    const email = without.filter((c) => c === "EMAIL");
    updateRule(key, {
      channels: ["IN_APP", ...email, ...(on ? (["WHATSAPP_LINK"] as const) : [])],
    });
  };

  const handleSave = async () => {
    if (!canEdit || !draft || !effectiveDraft || !saved) return;

    const rulesPatch: Record<string, unknown> = {};
    for (const m of RULE_META) {
      const rule = draft.rules[m.key];
      if (!rule) continue;
      const out: Record<string, unknown> = { enabled: rule.enabled, channels: rule.channels };
      if (m.setting === "daysBefore") {
        const n = Number(rule.daysBefore);
        if (!Number.isInteger(n) || n < 1 || n > 30) {
          toast.error(`"${m.label}": din 1 se 30 ke beech hone chahiye`);
          return;
        }
        out.daysBefore = n;
      } else if (m.setting === "offsetsDays") {
        const parsed = parseOffsets(offsetsText[m.key] ?? "");
        if (!parsed) {
          toast.error(`"${m.label}": din 1 se 365 tak ke number comma se alag likhein`);
          return;
        }
        out.offsetsDays = parsed;
      } else if (m.setting === "time") {
        if (!rule.time || !TIME_RE.test(rule.time)) {
          toast.error(`"${m.label}": sahi waqt (HH:mm) likhein`);
          return;
        }
        out.time = rule.time;
      }
      rulesPatch[m.key] = out;
    }
    if (!TIME_RE.test(draft.digestTime)) {
      toast.error("Khulasa ka waqt sahi (HH:mm) likhein");
      return;
    }

    setSaving(true);
    try {
      const result = await saveNotificationSettings(
        {
          rules: rulesPatch as never,
          digestTime: draft.digestTime,
          recipients: draft.recipients,
        },
        activeBranchId,
      );
      applyLoaded(result);
      toast.success("Notification settings save ho gayin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Settings save nahi hui");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6"
      data-testid="notif-settings"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">Notification Preferences</h2>
        <p className="text-sm text-slate-500">
          Yaad-dehani ke rules, khulasa ka waqt aur kis ko alerts milein.
        </p>
        {!canEdit && !loading && (
          <p className="mt-1 text-xs font-medium text-amber-600">
            Aap sirf dekh sakte hain. Tabdeeli ke liye Owner ya Manager se kahein.
          </p>
        )}
      </div>

      {loading || !draft ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Setting</th>
                  <th className="px-4 py-3 font-semibold">Channels</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RULE_META.map((m) => {
                  const rule = draft.rules[m.key];
                  if (!rule) return null;
                  const whatsapp = rule.channels?.includes("WHATSAPP_LINK") ?? false;
                  return (
                    <tr key={m.key} data-testid="notif-rule-row" data-rule={m.key}>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="notif-rule-toggle"
                            checked={rule.enabled}
                            disabled={!canEdit}
                            onChange={(e) => updateRule(m.key, { enabled: e.target.checked })}
                            className="h-4 w-4 accent-blue-600"
                          />
                          <span className="font-medium text-slate-800">{m.label}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        {m.setting === "daysBefore" && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <input
                              type="number"
                              min={1}
                              max={30}
                              data-testid="notif-rule-days"
                              value={rule.daysBefore ?? ""}
                              disabled={!canEdit}
                              onChange={(e) =>
                                updateRule(m.key, {
                                  daysBefore: e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                              className={`${inputCls} w-20`}
                            />
                            <span className="text-xs">din pehle</span>
                          </div>
                        )}
                        {m.setting === "offsetsDays" && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <input
                              type="text"
                              data-testid="notif-rule-offsets"
                              placeholder="1, 3, 7"
                              value={offsetsText[m.key] ?? ""}
                              disabled={!canEdit}
                              onChange={(e) =>
                                setOffsetsText((t) => ({ ...t, [m.key]: e.target.value }))
                              }
                              className={`${inputCls} w-36`}
                            />
                            <span className="text-xs">din baad</span>
                          </div>
                        )}
                        {m.setting === "time" && (
                          <input
                            type="time"
                            data-testid="notif-rule-time"
                            value={rule.time ?? ""}
                            disabled={!canEdit}
                            onChange={(e) => updateRule(m.key, { time: e.target.value })}
                            className={`${inputCls} w-32`}
                          />
                        )}
                        {m.setting === "digestTime" && (
                          <span className="text-xs text-slate-500">Neeche diye waqt par</span>
                        )}
                        {!m.setting && <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked disabled className="h-3.5 w-3.5" />
                            In-app
                          </label>
                          <label className="flex items-center gap-1.5 text-slate-400">
                            <input type="checkbox" disabled className="h-3.5 w-3.5" />
                            Email setup ke baad
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              data-testid="notif-channel-whatsapp"
                              checked={whatsapp}
                              disabled={!canEdit}
                              onChange={(e) => toggleWhatsapp(m.key, e.target.checked)}
                              className="h-3.5 w-3.5 accent-blue-600"
                            />
                            WhatsApp link
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Roz ke khulasa ka waqt
              </label>
              <input
                type="time"
                data-testid="notif-digest-time"
                value={draft.digestTime}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, digestTime: e.target.value })}
                className={`${inputCls} w-32`}
              />
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">
                Alerts kis ko milein
              </span>
              <div className="space-y-2 text-sm text-slate-700">
                {(
                  [
                    ["OWNER_ONLY", "Sirf owner", "notif-recipients-owner"],
                    ["OWNER_AND_MANAGERS", "Owner + managers", "notif-recipients-managers"],
                  ] as [Recipients, string, string][]
                ).map(([value, label, testId]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="notif-recipients"
                      data-testid={testId}
                      checked={draft.recipients === value}
                      disabled={!canEdit}
                      onChange={() => setDraft({ ...draft, recipients: value })}
                      className="h-4 w-4 accent-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {canEdit && dirty && (
            <div data-testid="notif-settings-save">
              <FloatingSaveBar isSaving={saving} handleSave={handleSave} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
