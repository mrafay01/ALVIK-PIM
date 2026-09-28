"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquareCheck, TriangleAlert } from "lucide-react";
import { PO_STATUSES } from "@/lib/enums";
import { PO_STATUS_LABEL, isChecklistFieldDone } from "@/lib/statusDisplay";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";

export function PoActions({
  poId,
  status,
  vendorReplySent,
  checklist,
}: {
  poId: string;
  status: string;
  vendorReplySent: boolean;
  checklist: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = PO_STATUSES.indexOf(status as (typeof PO_STATUSES)[number]);
  const nextStatus = PO_STATUSES[currentIndex + 1];

  const incompleteFields = Object.entries(checklist ?? {}).filter(
    ([field, value]) => !isChecklistFieldDone(field, value)
  );
  const blockedByChecklist = nextStatus === "ready_to_ship" && incompleteFields.length > 0;

  async function patchPo(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
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

  return (
    <Card>
      <h2 className="text-[0.95rem] mb-3.5">Actions</h2>
      <div className="flex flex-col gap-3">
        {nextStatus && (
          <div>
            <Button variant="primary" disabled={busy || blockedByChecklist} onClick={() => patchPo({ status: nextStatus })}>
              <span className="flex items-center gap-1.5">
                Advance to &quot;{PO_STATUS_LABEL[nextStatus]}&quot; <ArrowRight size={14} />
              </span>
            </Button>
            {blockedByChecklist && (
              <p className="text-[0.8rem] text-warn flex items-center gap-1.5 mt-2">
                <TriangleAlert size={14} />
                Blocked: checklist incomplete, {incompleteFields.map(([f]) => f).join(", ")}
              </p>
            )}
          </div>
        )}
        {!vendorReplySent && (
          <Button disabled={busy} onClick={() => patchPo({ vendorReplySent: true })}>
            <span className="flex items-center gap-1.5">
              <MessageSquareCheck size={14} /> Mark vendor reply sent
            </span>
          </Button>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Card>
  );
}
