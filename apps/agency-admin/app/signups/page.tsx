"use client";

import SignupsTable from "@/components/signups/SignupsTable";
import TasksList from "@/components/signups/TasksList";

export default function SignupsPage() {
  return (
    <div data-testid="signups-page" className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">New Signups</h2>
        <p className="text-slate-500 mt-1">Follow up every trial signup, track feedback and convert them to paid.</p>
      </div>
      <TasksList />
      <SignupsTable />
    </div>
  );
}
