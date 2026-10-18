"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import InvoiceList from "@/components/billing/InvoiceList";

export default function TenantBillingPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params?.id;
  if (!tenantId) return null;
  return (
    <div data-testid="tenant-billing-page" className="space-y-6 animate-in fade-in duration-500">
      <div>
        <Link
          href={`/tenants/${tenantId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 mb-2"
        >
          <ArrowLeft size={16} />
          Back to Tenant
        </Link>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Tenant invoices</h2>
      </div>
      <InvoiceList businessId={tenantId} />
    </div>
  );
}
