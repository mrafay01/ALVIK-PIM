import { hasFullAccess } from "@/lib/enums";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import PurchaseOrder from "@/models/PurchaseOrder";
import "@/models/User";
import "@/models/Quotation";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  MessageSquareCheck,
  MessageSquare,
  Ship,
  FileSpreadsheet,
  ExternalLink,
  Truck,
  TriangleAlert,
} from "lucide-react";
import { PO_STATUS_LABEL, PO_STATUS_TONE, isChecklistFieldDone } from "@/lib/statusDisplay";
import { MONDAY_BOARD_ID } from "@/lib/monday/config";
import { MONDAY_RECEIVED_LABELS } from "@/lib/purchase-orders/listState";
import { isClosedOnMonday, CHECKLIST_DONE, CHECKLIST_LOCKED_STATUSES } from "@/lib/purchase-orders/transitions";
import type { PoStatus } from "@/lib/enums";
import { isObjectId } from "@/lib/ids";
import { PoActions } from "./PoActions";
import { PoChecklist } from "./PoChecklist";
import { MondayUpdates } from "./MondayUpdates";
import { CopyPoFilesButton } from "./CopyPoFilesButton";

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
  if (!isObjectId(poId)) notFound();
  await connectDB();

  const [po, role] = await Promise.all([
    PurchaseOrder.findById(poId)
      .populate("vendorId", "name")
      .populate("lineItems.itemId", "itemNumber sampleSku vendorSku title status")
      .populate("statusHistory.changedBy", "name")
      .populate("quotationIds", "sourceFileName poNumber source createdAt")
      .lean(),
    getSessionRole(),
  ]);
  if (!po) notFound();

  const canEdit = roleCan(role, ROLE_SETS.purchaseOrders);
  const closedLabel = isClosedOnMonday(po.mondayStatusText) ? (po.mondayStatusText as string) : null;
  const checklist = (po.backOfficeChecklist ?? {}) as Record<string, string>;
  const doneCount = Object.keys(CHECKLIST_DONE).filter((f) => isChecklistFieldDone(f, checklist[f])).length;
  const allDone = doneCount === Object.keys(CHECKLIST_DONE).length;
  const checklistLocked = CHECKLIST_LOCKED_STATUSES.includes(po.status as PoStatus);
  const quotes = (po.quotationIds ?? []) as unknown as {
    _id: unknown;
    sourceFileName?: string | null;
    poNumber?: string | null;
    source?: string;
    createdAt?: Date;
  }[];

  const sharePointFiles = po.sharePointFiles ?? [];
  const copiedAssets = new Set(sharePointFiles.map((f) => f.mondayAssetId).filter(Boolean));
  const archiveErrorByAsset = new Map((po.archiveErrors ?? []).map((e) => [e.assetId, e.message]));
  const gaveUp = new Set(po.archiveGaveUp ?? []);
  // Monday files not in SharePoint yet: waiting to be copied, or given up on
  // (deleted on Monday, or failed 3 times). Only a given-up file still opens
  // from Monday, as the last way to reach it.
  const pendingMondayFiles = (po.mondayFiles ?? [])
    .filter((f) => !copiedAssets.has(f.assetId))
    .map((f) => ({ ...f, error: archiveErrorByAsset.get(f.assetId) ?? null, gaveUp: gaveUp.has(f.assetId) }));
  const waitingCount = pendingMondayFiles.filter((f) => !f.gaveUp).length;

  return (
    <AppShell
      activeHref="/purchase-orders"
      backHref="/purchase-orders"
      backLabel="Purchase Orders"
      eyebrow="Purchase order"
      title={po.poNumber}
    >
      <div className="flex items-center gap-2.5 mb-6 flex-wrap">
        {closedLabel ? (
          // Stored stage is a stale default for a board-closed PO; show the truth.
          <Pill tone={MONDAY_RECEIVED_LABELS.includes(closedLabel) ? "good" : "neutral"}>{closedLabel}</Pill>
        ) : (
          <Pill tone={PO_STATUS_TONE[po.status as keyof typeof PO_STATUS_TONE]}>
            {PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL]}
          </Pill>
        )}
        {po.mondayStatusText && po.mondayStatusMapped === false && !closedLabel && (
          <span
            title="Status as shown on the board"
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
                className="flex items-center gap-1 text-[0.75rem] text-brand no-underline"
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
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[0.95rem] m-0">Line items</h2>
            <span className="text-[0.75rem] text-ink-faint font-mono">{po.lineItems.length}</span>
          </div>
          {po.lineItems.length === 0 ? (
            <p className="text-[0.85rem] text-ink-faint m-0">
              {po.mondayItemId
                ? "No line items yet. Monday tracks this PO at the order level; line items appear here once the vendor's PI file is imported as a quote with this PO number."
                : "No line items on this PO."}
            </p>
          ) : (
            <div className="flex flex-col">
              {po.lineItems.map((li, i) => {
                const it = li.itemId as unknown as {
                  _id?: unknown;
                  itemNumber?: string;
                  sampleSku?: string;
                  vendorSku?: string;
                  title?: string;
                } | null;
                const total = li.totalCost ?? (li.qty != null && li.unitCost != null ? li.qty * li.unitCost : null);
                const label = it?.itemNumber || it?.sampleSku || it?.vendorSku || "Item";
                return (
                  <div
                    key={i}
                    className={`flex justify-between gap-3 text-[0.85rem] py-2 ${i < po.lineItems.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <span className="min-w-0">
                      {it?._id ? (
                        <Link href={`/items/${String(it._id)}`} className="font-mono font-semibold text-navy-deep no-underline">
                          {label}
                        </Link>
                      ) : (
                        <span className="text-ink-faint">Item removed</span>
                      )}
                      {it?.vendorSku && it.vendorSku !== label && (
                        <span className="text-ink-faint text-[0.78rem]"> · vendor {it.vendorSku}</span>
                      )}
                      {it?.title && <div className="text-[0.78rem] text-ink-faint truncate">{it.title}</div>}
                    </span>
                    <span className="text-ink-faint font-mono text-[0.8rem] whitespace-nowrap text-right">
                      qty {li.qty ?? "—"} · {fmtMoney(li.unitCost)} ea
                      <br />
                      <span className="text-ink">{fmtMoney(total)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[0.95rem]">Back-office checklist</h2>
          <span className={`text-[0.78rem] font-mono font-semibold ${allDone ? "text-good" : "text-ink-faint"}`}>
            {doneCount}/{Object.keys(CHECKLIST_DONE).length}
            {allDone && " (ready to ship)"}
          </span>
        </div>
        <p className="text-[0.82rem] text-ink-soft mb-3">
          {checklistLocked ? (
            <>
              Locked at <strong>{PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL]}</strong>.
            </>
          ) : (
            <>
              All six are needed before <strong>Ready to ship</strong>.
            </>
          )}
        </p>
        <PoChecklist
          key={JSON.stringify(checklist)}
          poId={String(po._id)}
          checklist={checklist}
          canEdit={canEdit && !closedLabel}
          lockDone={checklistLocked}
        />
      </Card>

      {quotes.length > 0 && (
        <Card className="mb-5">
          <h2 className="text-[0.95rem] mb-1">Created from vendor quote{quotes.length === 1 ? "" : "s"}</h2>
          <div className="flex flex-col gap-1.5">
            {quotes.map((q) => (
              <Link
                key={String(q._id)}
                href={`/purchase-orders/quotes/${String(q._id)}`}
                className="flex items-center gap-2 text-[0.85rem] text-brand no-underline py-1"
              >
                <FileSpreadsheet size={14} />
                {q.sourceFileName || q.poNumber || `Quote ${String(q._id).slice(-6)}`}
                <span className="text-ink-faint text-[0.75rem]">
                  {q.source === "file_upload" ? "file" : "manual"} · {fmtDate(q.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {(sharePointFiles.length > 0 || pendingMondayFiles.length > 0) && (
        <Card className="mb-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-[0.95rem]">PO documents</h2>
            {po.sharePointFolderUrl && (
              <a
                href={po.sharePointFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[0.82rem] text-brand no-underline"
              >
                <ExternalLink size={13} /> Open folder in SharePoint
              </a>
            )}
          </div>
          {waitingCount > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3 rounded-md bg-warn-bg px-3 py-2.5">
              <span className="text-[0.82rem] text-warn">
                {waitingCount} file{waitingCount === 1 ? " is" : "s are"} on Monday but not in SharePoint yet.
              </span>
              {canEdit && <CopyPoFilesButton poId={String(po._id)} />}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {sharePointFiles.map((f) => (
              <a
                key={f.driveItemId}
                href={f.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[0.85rem] text-brand no-underline py-1.5"
              >
                <FileSpreadsheet size={14} /> {f.name}
                <span className="text-[0.75rem] text-ink-faint">
                  {f.source === "monday" ? "from Monday" : "uploaded with a quote"}
                </span>
              </a>
            ))}
            {pendingMondayFiles.map((f) =>
              f.gaveUp ? (
                <div key={f.assetId} className="flex items-center gap-2 text-[0.85rem] py-1.5 flex-wrap">
                  <FileSpreadsheet size={14} className="text-ink-faint" /> <span className="text-ink-soft">{f.name}</span>
                  <span className="text-[0.75rem] text-critical">Couldn&apos;t be copied to SharePoint: {f.error ?? "unknown error"}</span>
                  <a
                    href={`/api/monday/files/${f.assetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.75rem] text-brand no-underline"
                  >
                    Try opening it on Monday
                  </a>
                </div>
              ) : (
                <div key={f.assetId} className="flex items-center gap-2 text-[0.85rem] py-1.5 flex-wrap">
                  <FileSpreadsheet size={14} className="text-ink-faint" /> <span className="text-ink-soft">{f.name}</span>
                  <span className="text-[0.75rem] text-ink-faint">
                    {f.error ? `Waiting to be copied to SharePoint (last try: ${f.error})` : "Waiting to be copied to SharePoint"}
                  </span>
                </div>
              )
            )}
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
          <div className="flex flex-col">
            {[...po.statusHistory].reverse().map((h, i) => {
              const who = (h.changedBy as unknown as { name?: string } | null)?.name;
              return (
                <div key={i} className="flex justify-between gap-3 text-[0.83rem] py-1.5 border-b border-border last:border-b-0">
                  <span>{PO_STATUS_LABEL[h.status as keyof typeof PO_STATUS_LABEL] ?? h.status}</span>
                  <span className="text-ink-faint text-[0.78rem] text-right">
                    {who ? `${who} · ` : ""}
                    <span className="font-mono">{h.changedAt ? new Date(h.changedAt).toLocaleString() : "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canEdit && (
        <div className="mb-5">
          <PoActions
            poId={String(po._id)}
            status={po.status}
            closedLabel={closedLabel}
            vendorReplySent={!!po.vendorReplySent}
            joelShipConfirmed={!!po.joelShipConfirmed}
            checklist={checklist}
            isAdmin={hasFullAccess(role)}
            mondayItemId={po.mondayItemId ?? null}
            lastPushedToMondayAt={po.lastPushedToMondayAt ? new Date(po.lastPushedToMondayAt).toISOString() : null}
            history={po.statusHistory.map((h) => ({ status: String(h.status ?? "") }))}
          />
        </div>
      )}

    </AppShell>
  );
}
