"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";

export function ItemActions({
  itemId,
  vendorId,
  status,
  hasReviewDecision,
  hasSampleSku,
}: {
  itemId: string;
  vendorId: string;
  status: string;
  hasReviewDecision: boolean;
  hasSampleSku: boolean;
}) {
  const router = useRouter();
  const [sampleSku, setSampleSku] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemNumber, setItemNumber] = useState("");
  const [category, setCategory] = useState("");
  const [metal, setMetal] = useState("");
  const [msrp, setMsrp] = useState("");

  async function patchItem(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createPO(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber,
          vendorId,
          orderPurposeCategory: "sample",
          itemId,
          qty: qty ? Number(qty) : undefined,
          unitCost: unitCost ? Number(unitCost) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create PO");
        return;
      }
      router.push(`/purchase-orders/${data.purchaseOrder._id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {hasReviewDecision && status === "approved" && !hasSampleSku && (
        <Card>
          <SectionTitle>Step 2 — Assign sample SKU</SectionTitle>
          <p className="text-[0.83rem] text-ink-soft mb-3">
            A temporary SKU for the sample stage — kept permanently for audit history even after
            a real item number is assigned later.
          </p>
          <div className="flex gap-2.5 items-end">
            <Field label="Sample SKU" width={180}>
              <Input value={sampleSku} onChange={(e) => setSampleSku(e.target.value)} placeholder="e.g. SMP-1001" />
            </Field>
            <Button variant="primary" disabled={busy || !sampleSku} onClick={() => patchItem({ sampleSku })}>
              <span className="flex items-center gap-1.5">
                <Tag size={15} /> Assign
              </span>
            </Button>
          </div>
        </Card>
      )}

      {hasSampleSku && status !== "po_sent" && (
        <Card>
          <SectionTitle>Step 3 — Create purchase order</SectionTitle>
          <p className="text-[0.83rem] text-ink-soft mb-3">
            Opens the PO/PI pipeline for this item — sample quantity and vendor unit cost, if known.
          </p>
          <form onSubmit={createPO} className="flex gap-2.5 items-end flex-wrap">
            <Field label="PO number" width={140}>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required />
            </Field>
            <Field label="Qty" width={80}>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Unit cost" width={100}>
              <Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              <span className="flex items-center gap-1.5">
                <FileText size={15} /> Create PO
              </span>
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle>Catalog fields</SectionTitle>
        <p className="text-[0.83rem] text-ink-soft mb-3">
          Fills the gaps that keep this item off the master DB completion gate. Images come from
          the SharePoint pipeline (Phase 4), not from here.
        </p>
        <div className="flex gap-2.5 flex-wrap items-end">
          <Field label="Permanent item #" width={150}>
            <Input value={itemNumber} onChange={(e) => setItemNumber(e.target.value)} />
          </Field>
          <Button disabled={busy || !itemNumber} onClick={() => patchItem({ itemNumber })}>
            Set
          </Button>
          <Field label="Category" width={130}>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Button disabled={busy || !category} onClick={() => patchItem({ category })}>
            Set
          </Button>
          <Field label="Metal" width={130}>
            <Input value={metal} onChange={(e) => setMetal(e.target.value)} />
          </Field>
          <Button disabled={busy || !metal} onClick={() => patchItem({ specs: { metal } })}>
            Set
          </Button>
          <Field label="MSRP" width={90}>
            <Input type="number" step="0.01" value={msrp} onChange={(e) => setMsrp(e.target.value)} />
          </Field>
          <Button disabled={busy || !msrp} onClick={() => patchItem({ pricing: { msrp: Number(msrp) } })}>
            Add
          </Button>
        </div>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[0.9rem] mb-1">{children}</h3>;
}
