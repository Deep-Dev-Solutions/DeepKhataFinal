"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import InvoiceForm from "./InvoiceForm";
import InvoicesTable from "./InvoicesTable";
import { Invoice } from "./types";

const STATUSES = ["", "DRAFT", "SENT", "PAID", "OVERDUE", "VOID"];

/** Invoice list with status filter and create modal. Optional businessId scopes it to one tenant. */
export default function InvoiceList({ businessId }: { businessId?: string }) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (businessId) qs.set("businessId", businessId);
    if (status) qs.set("status", status);
    try {
      const q = qs.toString();
      setInvoices(await api.get<Invoice[]>(`/agency/billing/invoices${q ? `?${q}` : ""}`));
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [businessId, status]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run().catch(console.error);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="w-44">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="invoice-status-filter"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </Select>
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="invoice-create-open"
        >
          <Plus />
          Generate Invoice
        </Button>
      </div>

      {error && (
        <div role="alert" className="bg-danger-bg text-danger border border-danger rounded-lg p-3 text-body font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading invoices...
        </div>
      ) : (
        <InvoicesTable invoices={invoices} showBusiness={!businessId} />
      )}

      {creating && (
        <InvoiceForm
          fixedBusinessId={businessId}
          onCancel={() => setCreating(false)}
          onCreated={(inv) => {
            setCreating(false);
            router.push(`/billing/${inv.id}`);
          }}
        />
      )}
    </div>
  );
}
