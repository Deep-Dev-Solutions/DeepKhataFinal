"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Wallet } from "lucide-react";

type PaymentHealthProps = {
  paymentHealth?: Array<{ name?: string; value?: number; color?: string }>;
};

export default function PaymentHealth({ paymentHealth = [] }: PaymentHealthProps) {
  const data = paymentHealth.length ? paymentHealth : [
    { name: 'Paid', value: 0, color: '#10b981' },
    { name: 'Pending/Udhaar', value: 0, color: '#f43f5e' },
  ];
  const totalVolume = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-slate-50 rounded-lg"><Wallet className="w-5 h-5 text-slate-600" /></div>
        <h2 className="text-lg font-bold text-slate-900">Payment Health</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">Distribution of your receivables</p>
      
      <div className="flex-1 w-full min-h-[200px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || '#10b981'} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value) => `Rs. ${Number(value ?? 0).toLocaleString()}`}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 font-medium">Total Volume</span>
          <span className="text-lg font-bold text-slate-900">Rs. {totalVolume.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {data.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color || '#10b981' }}></div>
              <span className="text-slate-600 font-medium">{item.name || "Payment"}</span>
            </div>
            <span className="font-bold text-slate-900">Rs. {Number(item.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}