import { Bell } from "lucide-react";

export default function NotificationsTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Notification Preferences</h2>
        <p className="text-sm text-slate-500">Choose what alerts you want to receive.</p>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-12 flex flex-col items-center justify-center text-center">
        <Bell className="w-10 h-10 mb-3 text-slate-300" />
        <p className="font-medium text-slate-900">Notification settings coming soon</p>
        <p className="text-sm text-slate-500 mt-1">You will be able to toggle email and push alerts here.</p>
      </div>
    </div>
  );
}