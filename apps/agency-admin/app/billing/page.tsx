"use client";

import InvoiceList from "@/components/billing/InvoiceList";

export default function BillingPage() {
  return (
    <div data-testid="billing-page" className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Billing</h2>
        <p className="text-slate-500 mt-1">Generate invoices, send them to owners and record payments.</p>
      </div>
      <InvoiceList />
    </div>
  );
}
