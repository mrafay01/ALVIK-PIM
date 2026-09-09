"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { PAYMENT_TRANCHES } from "@/lib/enums";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function RecordPaymentForm({ poId, vendorId }: { poId: string; vendorId: string }) {
  const router = useRouter();
  const [tranche, setTranche] = useState<(typeof PAYMENT_TRANCHES)[number]>("deposit");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId,
          vendorId,
          tranche,
          invoiceRef: invoiceRef || undefined,
          amountDue: amountDue ? Number(amountDue) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not record payment");
        return;
      }
      setInvoiceRef("");
      setAmountDue("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2.5 items-end flex-wrap">
      <Field label="Tranche" width={130}>
        <Select value={tranche} onChange={(e) => setTranche(e.target.value as typeof tranche)}>
          {PAYMENT_TRANCHES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Invoice ref" width={140}>
        <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
      </Field>
      <Field label="Amount due" width={100}>
        <Input type="number" step="0.01" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" disabled={busy}>
        <span className="flex items-center gap-1.5">
          <Wallet size={14} /> Record payment
        </span>
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
