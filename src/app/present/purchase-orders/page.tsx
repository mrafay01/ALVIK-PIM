"use client";

import { CheckCircle2, Circle, MessageSquareCheck, MessageSquare } from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MOCK_POS, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/components/present/mockData";

const CHECKLIST_LABELS: Record<string, string> = {
  images: "Images",
  data: "Data",
  pricing: "Pricing",
  jmUpdate: "Jm updated",
  onMaster: "On master",
  descriptions: "Descriptions",
};

export default function PurchaseOrdersPresentPage() {
  return (
    <PresentShell eyebrow="Vendor pipeline" title="Purchase Orders">
      <p className="text-ink-soft max-w-[68ch] mb-7 text-[0.92rem]">
        Replaces six separate Monday.com stage boards with one collection and a status field — each
        board was really just a filtered view of the same list. A PO can&apos;t reach{" "}
        <strong className="text-ink">Ready to ship</strong> until all six back-office
        checklist fields are complete — enforced server-side, not just by convention.
      </p>

      <div className="flex flex-col gap-3.5">
        {MOCK_POS.map((po) => {
          const checklistEntries = Object.entries(po.backOfficeChecklist);
          const doneCount = checklistEntries.filter(([, v]) => v).length;
          const allDone = doneCount === checklistEntries.length;

          return (
            <Card key={po.id}>
              <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="font-mono font-semibold text-base">PO {po.poNumber}</span>
                    <Pill tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Pill>
                  </div>
                  <div className="text-[0.85rem] text-ink-soft">
                    {po.vendorName} · {po.lineItemCount} line items
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-[1.1rem]">${po.poTotal.toLocaleString()}</div>
                  <div
                    className={`flex items-center gap-1.5 justify-end text-[0.78rem] mt-1 ${
                      po.vendorReplySent ? "text-good" : "text-ink-faint"
                    }`}
                  >
                    {po.vendorReplySent ? <MessageSquareCheck size={13} /> : <MessageSquare size={13} />}
                    {po.vendorReplySent ? "Vendor replied" : "Awaiting reply"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Back-office checklist
                </span>
                <span className={`text-[0.75rem] font-mono font-semibold ${allDone ? "text-good" : "text-ink-faint"}`}>
                  {doneCount}/{checklistEntries.length}
                  {po.status === "ready_to_ship" && allDone && " — gate satisfied"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {checklistEntries.map(([key, done]) => (
                  <span
                    key={key}
                    className={`flex items-center gap-1.5 text-[0.78rem] px-2.5 py-1.5 rounded-full ${
                      done ? "bg-good-bg text-good" : "bg-neutral-pill text-ink-faint"
                    }`}
                  >
                    {done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    {CHECKLIST_LABELS[key]}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </PresentShell>
  );
}
