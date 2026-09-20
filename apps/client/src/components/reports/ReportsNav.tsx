import { TrendingUp, Package, Users, Star } from "lucide-react";

interface ReportsNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function ReportsNav({ activeTab, setActiveTab }: ReportsNavProps) {
  const tabs = [
    { id: "overview", name: "Financial Overview", icon: TrendingUp },
    { id: "inventory", name: "Inventory Insights", icon: Package },
    { id: "staff", name: "Staff Performance", icon: Users },
    { id: "customers", name: "Customer Insights", icon: Star },
  ];

  return (
    <nav className="flex items-center gap-6 border-b border-slate-200 w-full overflow-x-auto hide-scrollbar mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Icon className="w-4 h-4" /> {tab.name}
          </button>
        );
      })}
    </nav>
  );
}