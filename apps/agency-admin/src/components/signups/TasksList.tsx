"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { AgencyTask, formatDate } from "./types";

const TYPE_LABEL: Record<AgencyTask["type"], string> = {
  FOLLOW_UP: "Follow up",
  FEEDBACK_CALL: "Feedback call",
  CONVERSION: "Conversion",
};

export default function TasksList() {
  const [tasks, setTasks] = useState<AgencyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState("");

  const load = useCallback(async () => {
    try {
      setTasks(await api.get<AgencyTask[]>("/agency/tasks?status=OPEN"));
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run().catch(console.error);
  }, [load]);

  const markDone = async (id: string) => {
    setDoneId(id);
    setError("");
    try {
      await api.patch(`/agency/tasks/${id}`, { status: "DONE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setDoneId("");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">Open tasks</h3>
        <span className="text-xs font-semibold text-slate-500">{tasks.length} open</span>
      </div>
      {error && (
        <div role="alert" className="m-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm font-medium">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center p-8 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">No open tasks. All caught up.</div>
      ) : (
        <ul data-testid="tasks-list" className="divide-y divide-slate-100">
          {tasks.map((t) => {
            const name = t.business?.name ?? t.business?.businessName ?? t.businessId;
            return (
              <li key={t.id} data-testid="task-row" data-task-id={t.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">
                    {TYPE_LABEL[t.type] ?? t.type} -{" "}
                    <Link href={`/tenants/${t.businessId}`} className="text-indigo-700 hover:underline">
                      {name}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-500">
                    Due {formatDate(t.dueAt)}
                    {t.notes ? ` - ${t.notes}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => markDone(t.id)}
                  disabled={doneId === t.id}
                  data-testid="task-done"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50"
                >
                  {doneId === t.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Mark done
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
