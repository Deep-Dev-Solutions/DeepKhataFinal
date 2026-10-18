"use client";

import { useParams } from "next/navigation";
import InvoiceDetail from "@/components/billing/InvoiceDetail";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <InvoiceDetail invoiceId={params.id} />;
}
