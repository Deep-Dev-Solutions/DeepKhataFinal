import { Save } from "lucide-react";

interface FloatingSaveBarProps {
  isSaving: boolean;
  handleSave: () => void;
}

export default function FloatingSaveBar({ isSaving, handleSave }: FloatingSaveBarProps) {
  return (
    <div className="fixed bottom-6 right-4 md:right-8 bg-white border border-slate-200 p-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-4 z-40 animate-in slide-in-from-bottom-10">
      <span className="text-sm font-medium text-slate-500 px-2 hidden sm:block">You have unsaved changes</span>
      <button 
        onClick={handleSave}
        disabled={isSaving}
        className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-all shadow-md disabled:opacity-70 w-full sm:w-auto justify-center"
      >
        {isSaving ? "Saving..." : "Save Changes"}
        {!isSaving && <Save className="w-4 h-4" />}
      </button>
    </div>
  );
}