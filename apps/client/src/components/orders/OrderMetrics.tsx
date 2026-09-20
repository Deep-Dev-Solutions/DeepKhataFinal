export default function OrderMetrics({ orders, activeTab }: { orders: any[], activeTab: string }) {
  // 1. Safely calculate totals ensuring they are treated as Numbers
  const totalValue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const unpaidValue = orders.reduce((sum, order) => sum + (Number(order.pendingBalance) || 0), 0);

  // 2. Format the tab name for perfect English grammar
  const formattedTabName = activeTab.replace("-", " ");
  const displayLabel = activeTab === "all-orders" 
    ? "results" 
    : `${formattedTabName} orders`;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 px-4 mb-4 shadow-sm">
      
      {/* Left Side: Order Count */}
      <div className="text-sm text-slate-600 font-medium">
        Showing <strong>{orders.length}</strong> {displayLabel}
      </div>

      {/* Right Side: Financial Math */}
      <div className="flex items-center gap-4 text-sm mt-2 sm:mt-0">
        <span className="text-slate-600">
          Total Value: <strong className="text-slate-900">Rs. {totalValue.toLocaleString()}</strong>
        </span>
        
        {/* Subtle dot separator */}
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
        
        {/* Dynamic Outstanding Color */}
        <span className={`${unpaidValue > 0 ? 'text-rose-600 font-bold' : 'text-slate-500 font-medium'}`}>
          Outstanding: Rs. {unpaidValue.toLocaleString()}
        </span>
      </div>
      
    </div>
  );
}