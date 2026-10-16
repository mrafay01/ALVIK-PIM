"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, MessageSquareCheck, TriangleAlert, Ship, RefreshCw, Lock } from "lucide-react";
import { PO_STATUS_LABEL } from "@/lib/statusDisplay";
import { checklistLabel } from "@/lib/statusDisplay";
import {
  nextPoStatuses,
  previousPoStatus,
  incompleteChecklistFields,
} from "@/lib/purchase-orders/transitions";
import type { PoStatus } from "@/lib/enums";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";

export function PoActions({
  poId,
  status,
  closedLabel,
  vendorReplySent,
  joelShipConfirmed,
  checklist,
  isAdmin,
  mondayItemId,
  lastPushedToMondayAt,
}: {
  poId: string;
  status: string;
  /** Monday's "Received"/"Canceled" label when the board has closed this PO. */
  closedLabel: string | null;
  vendorReplySent: boolean;
  joelShipConfirmed: boolean;
  checklist: Record<string, string>;
  isAdmin: boolean;
  mondayItemId: string | null;
  lastPushedToMondayAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nextOptions = nextPoStatuses(status);
  const previous = previousPoStatus(status);
  const missing = incompleteChecklistFields(checklist);

  async function patchPo(key: string, body: Record<string, unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      if (done) setNotice(done);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function syncToMonday() {
    if (
      !mondayItemId &&
      !window.confirm("This PO isn't on the Monday board yet. Syncing will create a new item on the board. Continue?")
    ) {
      return;
    }
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/monday-sync`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      setNotice(data.created ? "Created on the Monday board." : "Monday board updated.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (closedLabel) {
    return (
      <Card>
        <h2 className="text-[0.95rem] mb-2">Actions</h2>
        <p className="text-[0.85rem] text-ink-soft flex items-start gap-2 m-0">
          <Lock size={15} className="mt-0.5 shrink-0" />
          This PO is marked <strong className="text-ink">&nbsp;{closedLabel}&nbsp;</strong> on Monday, so it&apos;s
          finished; its stage can&apos;t be changed here.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-[0.95rem] mb-3.5">Actions</h2>
      <div className="flex flex-col gap-4">
        {/* Stage */}
        <div>
          <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-faint mb-2">Stage</div>
          {nextOptions.length === 0 ? (
            <p className="text-[0.85rem] text-good m-0">Received. This is the final stage.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextOptions.map((next, i) => {
                const blocked = next === "ready_to_ship" && missing.length > 0;
                return (
                  <Button
                    key={next}
                    variant={i === nextOptions.length - 1 ? "primary" : "secondary"}
                    disabled={!!busy || blocked}
                    onClick={() =>
                      patchPo(`status:${next}`, { status: next }, `Moved to "${PO_STATUS_LABEL[next as PoStatus]}".`)
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      {busy === `status:${next}` ? "Saving…" : <>Move to &quot;{PO_STATUS_LABEL[next as PoStatus]}&quot;</>}
                      <ArrowRight size={14} />
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
          {nextOptions.includes("ready_to_ship") && missing.length > 0 && (
            <p className="text-[0.8rem] text-warn flex items-center gap-1.5 mt-2 mb-0">
              <TriangleAlert size={14} className="shrink-0" />
              Finish the back-office checklist first: {missing.map(checklistLabel).join(", ")}.
            </p>
          )}
          {isAdmin && previous && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (window.confirm(`Move this PO back to "${PO_STATUS_LABEL[previous]}"?`)) {
                  patchPo("back", { status: previous }, `Moved back to "${PO_STATUS_LABEL[previous]}".`);
                }
              }}
              className="mt-2.5 inline-flex items-center gap-1 text-[0.78rem] text-ink-faint hover:text-ink bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft size={12} /> Move back to &quot;{PO_STATUS_LABEL[previous]}&quot; (admin)
            </button>
          )}
        </div>

        {/* Vendor + shipping flags */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
          {!vendorReplySent && (
            <Button
              disabled={!!busy}
              onClick={() => patchPo("reply", { vendorReplySent: true }, "Marked vendor reply as sent.")}
            >
              <span className="flex items-center gap-1.5">
                <MessageSquareCheck size={14} /> Mark vendor reply sent
              </span>
            </Button>
          )}
          <Button
            disabled={!!busy}
            onClick={() =>
              patchPo(
                "ship",
                { joelShipConfirmed: !joelShipConfirmed },
                joelShipConfirmed ? "Ship confirmation removed." : "Shipping confirmed."
              )
            }
          >
            <span className="flex items-center gap-1.5">
              <Ship size={14} /> {joelShipConfirmed ? "Undo ship confirmation" : "Confirm ship (Joel)"}
            </span>
          </Button>
        </div>

        {/* Monday */}
        <div className="pt-3 border-t border-border flex items-center gap-3 flex-wrap">
          <Button disabled={!!busy} onClick={syncToMonday}>
            <span className="flex items-center gap-1.5">
              <RefreshCw size={14} className={busy === "sync" ? "spin" : undefined} />
              {busy === "sync" ? "Syncing…" : mondayItemId ? "Sync to Monday" : "Add to Monday board"}
            </span>
          </Button>
          <span className="text-[0.75rem] text-ink-faint">
            {lastPushedToMondayAt
              ? `Last synced ${new Date(lastPushedToMondayAt).toLocaleString()}`
              : "Not synced to Monday yet. Changes made here stay in PIM until you sync."}
          </span>
        </div>

        {error && <ErrorText>{error}</ErrorText>}
        {!error && notice && <p className="text-good text-[0.82rem] m-0">{notice}</p>}
      </div>
    </Card>
  );
}
