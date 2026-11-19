import { hasFullAccess } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { Types, Error as MongooseError } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { PoPatchSchema, badRequest } from "@/lib/schemas";
import {
  isValidPoTransition,
  isClosedOnMonday,
  incompleteChecklistFields,
  CHECKLIST_LOCKED_STATUSES,
  CHECKLIST_DONE,
} from "@/lib/purchase-orders/transitions";
import { PO_STATUS_LABEL, checklistLabel } from "@/lib/statusDisplay";
import type { PoStatus } from "@/lib/enums";
import { isObjectId } from "@/lib/ids";
import PurchaseOrder from "@/models/PurchaseOrder";
import Vendor from "@/models/Vendor";
import { notifyAfterResponse } from "@/lib/notifications/notify";
import { poStageChanged } from "@/lib/notifications/messages";

const label = (s: string) => PO_STATUS_LABEL[s as PoStatus] ?? s;

// PATCH: advance the PO through the 8-stage pipeline (§ blueprint), or
// update the back-office checklist and the vendor-reply / ship flags. Every
// status change is appended to statusHistory so the pipeline stays
// auditable, matching how it worked on the Monday.com boards this replaces.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { poId } = await params;
  if (!isObjectId(poId)) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  const parsed = PoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  await connectDB();

  const po = await PurchaseOrder.findById(poId);
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  // Monday marks this PO Received/Canceled: it's finished and read-only here
  // (stage, checklist and flags alike), so Monday stays the record of it.
  if (isClosedOnMonday(po.mondayStatusText)) {
    return NextResponse.json(
      { error: `This PO is marked "${po.mondayStatusText}" on Monday, so it can't be changed here.` },
      { status: 409 }
    );
  }

  const doneBefore = new Set(
    Object.keys(CHECKLIST_DONE).filter(
      (f) => !incompleteChecklistFields(po.backOfficeChecklist as unknown as Record<string, unknown>).includes(f)
    )
  );
  // Path by path, so a PO without a checklist yet gets one and other fields
  // are never overwritten.
  if (body.backOfficeChecklist) {
    for (const [field, value] of Object.entries(body.backOfficeChecklist)) {
      if (value !== undefined) po.set(`backOfficeChecklist.${field}`, value);
    }
  }

  const previousStatus = po.status as string;
  if (body.status && body.status !== previousStatus) {
    const isAdmin = hasFullAccess(gate.role);
    const history = po.statusHistory.map((h) => ({ status: h.status }));
    if (!isValidPoTransition(previousStatus, body.status, { allowBack: isAdmin, history })) {
      return NextResponse.json(
        { error: `Can't move this PO from "${label(previousStatus)}" to "${label(body.status)}".` },
        { status: 400 }
      );
    }
    po.status = body.status;
    po.statusHistory.push({
      status: body.status,
      changedAt: new Date(),
      changedBy: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
    });
  }

  // Every PO on the real "Ready to Ship" board has all six checklist fields
  // complete: a hard gate, enforced here rather than trusted to the UI.
  // Moving into Ready to ship or later needs the full checklist (checked as
  // it will be after this request, so "complete the last item + advance" in
  // one request works), and once there an edit can't un-complete a field.
  // (A PO pulled from Monday may already sit there incomplete; finishing its
  // fields one by one is still allowed.)
  const incomplete = incompleteChecklistFields(po.backOfficeChecklist as unknown as Record<string, unknown>);
  const locked = CHECKLIST_LOCKED_STATUSES.includes(po.status as PoStatus);
  const statusChanged = po.status !== previousStatus;
  if (locked && statusChanged && incomplete.length > 0 && !CHECKLIST_LOCKED_STATUSES.includes(previousStatus as PoStatus)) {
    return NextResponse.json(
      { error: `Finish the back-office checklist first: ${incomplete.map(checklistLabel).join(", ")}.` },
      { status: 400 }
    );
  }
  const undone = incomplete.filter((f) => doneBefore.has(f));
  if (locked && undone.length > 0) {
    return NextResponse.json(
      {
        error: `A PO at "${label(po.status as string)}" must keep its checklist complete, so ${undone
          .map(checklistLabel)
          .join(", ")} can't be changed back. Move the PO back a stage first if it really needs to.`,
      },
      { status: 400 }
    );
  }

  // A mis-click can be undone; the time and person of the reply go with it.
  if (body.vendorReplySent === true && !po.vendorReplySent) {
    po.vendorReplySent = true;
    if (session.user?.id) po.vendorReplySentBy = new Types.ObjectId(session.user.id);
    po.vendorReplySentAt = new Date();
  } else if (body.vendorReplySent === false && po.vendorReplySent) {
    po.vendorReplySent = false;
    po.set("vendorReplySentBy", undefined);
    po.set("vendorReplySentAt", undefined);
  }

  if (typeof body.joelShipConfirmed === "boolean") {
    po.joelShipConfirmed = body.joelShipConfirmed;
  }

  // Only saves if the stage is still what it was when read: two people
  // moving the same PO at once can't both win (or double-advance it).
  po.$where = { status: previousStatus };
  try {
    await po.save();
  } catch (err) {
    if (err instanceof MongooseError.DocumentNotFoundError) {
      return NextResponse.json(
        { error: "Someone else just changed this PO's stage. Refresh the page to see where it is now." },
        { status: 409 }
      );
    }
    throw err;
  }

  if (po.status !== previousStatus) {
    const vendor = po.vendorId ? await Vendor.findById(po.vendorId).select("name").lean() : null;
    for (const n of poStageChanged({
      poId: String(po._id),
      poNumber: po.poNumber,
      vendorName: vendor?.name,
      from: previousStatus,
      to: po.status as string,
      actorId: session.user?.id,
      actorName: session.user?.name,
    })) {
      notifyAfterResponse(n);
    }
  }

  return NextResponse.json({ purchaseOrder: po });
}
