"use client";

import InvoiceList from "@/components/billing/InvoiceList";
import { PageHeader } from "@/components/ui/page-header";

export default function BillingPage() {
  return (
    <div data-testid="billing-page" className="space-y-4 animate-in fade-in duration-300">
      <PageHeader title="Billing" subtitle="Generate invoices, send them to owners and record payments." />
      <InvoiceList />
    </div>
  );
}
