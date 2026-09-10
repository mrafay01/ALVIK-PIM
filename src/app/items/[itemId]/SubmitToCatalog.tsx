"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function SubmitToCatalog({
  itemId,
  state,
}: {
  itemId: string;
  // "eligible": complete quote item not yet submitted
  // "pending":  submitted, awaiting admin approval
  // "approved": in the catalog
  // "incomplete": quote item whose record isn't complete yet
  state: "eligible" | "pending" | "approved" | "incomplete";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/submit-to-catalog`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not submit");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[0.95rem] mb-2.5">Catalog</h2>
      {state === "approved" && (
        <p className="text-good text-[0.86rem] flex items-center gap-1.5 m-0">
          <CheckCircle2 size={15} /> In the finalized catalog.
        </p>
      )}
      {state === "pending" && (
        <p className="text-warn text-[0.86rem] flex items-center gap-1.5 m-0">
          <Clock size={15} /> Submitted — waiting for admin approval.
        </p>
      )}
      {state === "incomplete" && (
        <p className="text-ink-soft text-[0.86rem] m-0">
          Complete the master record (see the checklist on the Catalog page) before this item can be
          submitted.
        </p>
      )}
      {state === "eligible" && (
        <div className="flex flex-col gap-2">
          <p className="text-ink-soft text-[0.86rem] m-0">
            This item&apos;s record is complete. Submit it to the catalog — an admin approves it
            before it goes in.
          </p>
          <div>
            <Button variant="primary" onClick={submit} disabled={busy}>
              <span className="flex items-center gap-1.5">
                <PackageCheck size={14} /> {busy ? "Submitting…" : "Submit to catalog"}
              </span>
            </Button>
          </div>
          {error && <p className="text-critical text-[0.82rem] m-0">{error}</p>}
        </div>
      )}
    </Card>
  );
}
