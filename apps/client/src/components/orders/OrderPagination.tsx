import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  indexOfFirstItem: number;
  indexOfLastItem: number;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export default function OrderPagination({ 
  currentPage, totalPages, totalItems, indexOfFirstItem, indexOfLastItem, onNextPage, onPrevPage 
}: Props) {
  
  // 🟢 SAFETY MATH: Prevent weird UI states like "Showing 1 to 0 of 0"
  const safeFirstItem = totalItems === 0 ? 0 : indexOfFirstItem;
  const safeLastItem = totalItems === 0 ? 0 : indexOfLastItem;

  return (
    <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
      
      {/* 🟢 RESULTS COUNTER */}
      <span className="text-slate-500 text-center sm:text-left">
        Showing <strong className="text-slate-900">{safeFirstItem}</strong> to <strong className="text-slate-900">{safeLastItem}</strong> of <strong className="text-slate-900">{totalItems}</strong> results
      </span>
      
      {/* 🟢 BUTTONS & PAGE INDICATOR */}
      <div className="flex items-center gap-2">
        <button 
          onClick={onPrevPage} 
          disabled={currentPage <= 1}
          aria-label="Previous Page"
          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <span className="text-slate-600 font-medium px-2">
          Page {totalItems === 0 ? 0 : currentPage} of {totalPages === 0 ? 1 : totalPages}
        </span>
        
        <button 
          onClick={onNextPage} 
          disabled={currentPage >= totalPages || totalItems === 0}
          aria-label="Next Page"
          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}