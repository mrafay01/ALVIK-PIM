import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import Payment from "@/models/Payment";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  CheckCircle2,
  Circle,
  MessageSquareCheck,
  MessageSquare,
  Ship,
  FileSpreadsheet,
  ExternalLink,
  Truck,
  TriangleAlert,
} from "lucide-react";
import { PO_STATUS_LABEL, PO_STATUS_TONE, checklistLabel, isChecklistFieldDone } from "@/lib/statusDisplay";
import { MONDAY_BOARD_ID } from "@/lib/monday/config";
import { PoActions } from "./PoActions";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { MondayUpdates } from "./MondayUpdates";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(n: number | null | undefined): string {
  return n != null ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = await params;
  await connectDB();

  const po = await PurchaseOrder.findById(poId)
    .populate("vendorId", "name")
    .populate("lineItems.itemId", "itemNumber sampleSku vendorSku status")
    .lean();
  if (!po) notFound();

  const payments = await Payment.find({ poId }).sort({ createdAt: -1 }).lean();

  const checklistEntries = Object.entries(po.backOfficeChecklist ?? {});
  const doneCount = checklistEntries.filter(([field, value]) => isChecklistFieldDone(field, value as string)).length;
  const allDone = checklistEntries.length > 0 && doneCount === checklistEntries.length;

  return (
    <AppShell
      activeHref="/purchase-orders"
      backHref="/purchase-orders"
      backLabel="Purchase Orders"
      eyebrow="Purchase order"
      title={po.poNumber}
    >
      <div className="flex items-center gap-2.5 mb-6 flex-wrap">
        <Pill tone={PO_STATUS_TONE[po.status as keyof typeof PO_STATUS_TONE]}>
          {PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL]}
        </Pill>
        {po.mondayStatusText && po.mondayStatusMapped === false && (
          <span
            title="This board item's Monday status has no equivalent in this app's pipeline, so the pipeline status above wasn't moved by it — this is the board's exact current status"
            className="flex items-center gap-1.5 text-[0.78rem] px-2.5 py-1 rounded-full bg-warn-bg text-warn"
          >
            <TriangleAlert size={13} /> Board status: {po.mondayStatusText}
          </span>
        )}
        <span className="text-[0.85rem] text-ink-soft">
          {(po.vendorId as unknown as { name?: string } | null)?.name || "—"}
        </span>
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 items-start mb-5">
        <Card>
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[0.95rem] m-0">Details</h2>
            {po.mondayItemId && (
              <a
                href={`https://view.monday.com/boards/${MONDAY_BOARD_ID}/pulses/${po.mondayItemId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[0.75rem] text-brass no-underline"
              >
                <ExternalLink size={12} /> View on Monday
              </a>
            )}
          </div>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2.5 m-0 text-[0.87rem]">
            <dt className="text-ink-faint">Purpose</dt>
            <dd className="m-0 capitalize">
              {po.orderPurpose?.category?.replace(/_/g, " ") || "—"}
              {po.orderPurpose?.tag && <span className="text-ink-faint"> · {po.orderPurpose.tag}</span>}
            </dd>
            <dt className="text-ink-faint">Priority</dt>
            <dd className="m-0 capitalize">{po.priority || "—"}</dd>
            <dt className="text-ink-faint">PO total</dt>
            <dd className="m-0 font-mono">{fmtMoney(po.poTotal)}</dd>
            <dt className="text-ink-faint">Prepayment deposit</dt>
            <dd className="m-0 font-mono">{fmtMoney(po.prepaymentDeposit)}</dd>
            <dt className="text-ink-faint">Remaining balance</dt>
            <dd className="m-0 font-mono">{fmtMoney(po.remainingBalance)}</dd>
            <dt className="text-ink-faint">Order date</dt>
            <dd className="m-0">{fmtDate(po.orderDate)}</dd>
            <dt className="text-ink-faint">Request date</dt>
            <dd className="m-0">{fmtDate(po.requestDate)}</dd>
            <dt className="text-ink-faint">Vendor conf. date</dt>
            <dd className="m-0">{fmtDate(po.vendorConfDate)}</dd>
            <dt className="text-ink-faint">Tracking number</dt>
            <dd className="m-0 flex items-center gap-1.5 font-mono">
              {po.trackingNumber ? (
                <>
                  <Truck size={14} color="var(--ink-faint)" /> {po.trackingNumber}
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-ink-faint">Vendor reply</dt>
            <dd className="m-0 flex items-center gap-1.5">
              {po.vendorReplySent ? <MessageSquareCheck size={14} color="var(--good)" /> : <MessageSquare size={14} color="var(--ink-faint)" />}
              {po.vendorReplySent ? "Sent" : "Not sent"}
            </dd>
            <dt className="text-ink-faint">Ship confirmed</dt>
            <dd className="m-0 flex items-center gap-1.5">
              <Ship size={14} color={po.joelShipConfirmed ? "var(--good)" : "var(--ink-faint)"} />
              {po.joelShipConfirmed ? "Yes" : "No"}
            </dd>
            <dt className="text-ink-faint">Board status (raw)</dt>
            <dd className="m-0">
              {po.mondayStatusText ? (
                <>
                  {po.mondayStatusText}
                  {po.mondayStatusMapped === false && (
                    <span className="text-warn text-[0.78rem] ml-1.5">(not in app pipeline)</span>
                  )}
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-ink-faint">Monday item ID</dt>
            <dd className="m-0 font-mono text-ink-faint">{po.mondayItemId || "—"}</dd>
            <dt className="text-ink-faint">Last pulled</dt>
            <dd className="m-0 text-ink-faint">
              {po.lastPulledFromMondayAt ? new Date(po.lastPulledFromMondayAt).toLocaleString() : "—"}
            </dd>
            <dt className="text-ink-faint">Last pushed</dt>
            <dd className="m-0 text-ink-faint">
              {po.lastPushedToMondayAt ? new Date(po.lastPushedToMondayAt).toLocaleString() : "—"}
            </dd>
          </dl>
        </Card>

        <Card>
          <h2 className="text-[0.95rem] mb-3.5">Line items</h2>
          <div className="flex flex-col gap-2">
            {po.lineItems.map((li, i) => {
              const it = li.itemId as unknown as {
                itemNumber?: string;
                sampleSku?: string;
                vendorSku?: string;
              } | null;
              const total = li.totalCost ?? (li.qty != null && li.unitCost != null ? li.qty * li.unitCost : null);
              return (
                <div
                  key={i}
                  className={`flex justify-between text-[0.85rem] py-1.5 ${i < po.lineItems.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span>{it?.vendorSku || it?.sampleSku || it?.itemNumber || "item"}</span>
                  <span className="text-ink-faint font-mono">
                    qty {li.qty ?? "—"} · {fmtMoney(li.unitCost)} each · {fmtMoney(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[0.95rem]">Back-office checklist</h2>
          <span className={`text-[0.78rem] font-mono font-semibold ${allDone ? "text-good" : "text-ink-faint"}`}>
            {doneCount}/{checklistEntries.length}
            {allDone && " — ready to ship"}
          </span>
        </div>
        <p className="text-[0.82rem] text-ink-soft mb-3">
          A purchase order can&apos;t move to <strong>Ready to ship</strong> until every item below is
          complete — enforced by the server, not just this checklist.
        </p>
        <div className="flex flex-wrap gap-2">
          {checklistEntries.map(([field, value]) => {
            const done = isChecklistFieldDone(field, value as string);
            return (
              <span
                key={field}
                className={`flex items-center gap-1.5 text-[0.8rem] px-3 py-1.5 rounded-full ${
                  done ? "bg-good-bg text-good" : "bg-neutral-pill text-ink-faint"
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {checklistLabel(field)}
                <span className="font-mono text-[0.72rem] opacity-75">({String(value)})</span>
              </span>
            );
          })}
        </div>
      </Card>

      {po.mondayFiles && po.mondayFiles.length > 0 && (
        <Card className="mb-5">
          <h2 className="text-[0.95rem] mb-1">Vendor PI files</h2>
          <p className="text-[0.8rem] text-ink-faint mb-3">
            Uploaded by the vendor on Monday.com — files stay there; each link fetches a fresh copy on click.
          </p>
          <div className="flex flex-col gap-1.5">
            {po.mondayFiles.map((f) => (
              <a
                key={f.assetId}
                href={`/api/monday/files/${f.assetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[0.85rem] text-brass no-underline py-1.5"
              >
                <FileSpreadsheet size={14} /> {f.name}
              </a>
            ))}
          </div>
        </Card>
      )}

      {po.mondayItemId && (
        <div className="mb-5">
          <MondayUpdates mondayItemId={po.mondayItemId} />
        </div>
      )}

      <Card className="mb-5">
        <h2 className="text-[0.95rem] mb-3.5">Status history</h2>
        {po.statusHistory.length === 0 ? (
          <p className="text-ink-faint text-[0.85rem] m-0">No changes recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {po.statusHistory.map((h, i) => (
              <div key={i} className="flex justify-between text-[0.83rem] py-1.5">
                <span className="capitalize">{h.status.replace(/_/g, " ")}</span>
                <span className="text-ink-faint font-mono">{h.changedAt ? new Date(h.changedAt).toLocaleString() : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mb-5">
        <PoActions
          poId={String(po._id)}
          status={po.status}
          vendorReplySent={!!po.vendorReplySent}
          checklist={po.backOfficeChecklist as Record<string, string>}
        />
      </div>

      <Card>
        <h2 className="text-[0.95rem] mb-3.5">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-ink-faint text-[0.85rem] mb-4">None recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {payments.map((p) => (
              <div key={String(p._id)} className="flex justify-between text-[0.85rem] px-2.5 py-2 rounded-sm bg-surface-sunken">
                <span className="capitalize">{p.tranche}</span>
                <span className="font-mono">${p.amountDue ?? "—"}</span>
                <span className="capitalize text-ink-soft">{p.status.replace(/_/g, " ")}</span>
                <span className="text-ink-faint">{p.dueDate ? `due ${new Date(p.dueDate).toLocaleDateString()}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
        <RecordPaymentForm poId={String(po._id)} vendorId={String((po.vendorId as unknown as { _id: unknown })._id)} />
      </Card>
    </AppShell>
  );
}
