"use client";

import SignupsTable from "@/components/signups/SignupsTable";
import { PageHeader } from "@/components/ui/page-header";
import TasksList from "@/components/signups/TasksList";

export default function SignupsPage() {
  return (
    <div data-testid="signups-page" className="space-y-4 animate-in fade-in duration-300">
      <PageHeader title="New Signups" subtitle="Follow up every trial signup, track feedback and convert them to paid." />
      <TasksList />
      <SignupsTable />
    </div>
  );
}
