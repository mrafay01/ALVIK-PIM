import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { PoPatchSchema, badRequest } from "@/lib/schemas";
import {
  isValidPoTransition,
  isClosedOnMonday,
  incompleteChecklistFields,
} from "@/lib/purchase-orders/transitions";
import { PO_STATUS_LABEL } from "@/lib/statusDisplay";
import PurchaseOrder from "@/models/PurchaseOrder";

// PATCH: advance the PO through the 8-stage pipeline (§ blueprint), or
// update the back-office checklist. Every status change is appended to
// statusHistory so the pipeline stays auditable, matching how it worked
// on the Monday.com boards this replaces.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { poId } = await params;
  if (!Types.ObjectId.isValid(poId)) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }
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

  if (body.backOfficeChecklist) {
    Object.assign(po.backOfficeChecklist, body.backOfficeChecklist);
  }

  if (body.status && body.status !== po.status) {
    const isAdmin = gate.role === "administrator";
    if (!isValidPoTransition(po.status as string, body.status, { allowBack: isAdmin })) {
      const from = PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL] ?? po.status;
      const to = PO_STATUS_LABEL[body.status as keyof typeof PO_STATUS_LABEL] ?? body.status;
      return NextResponse.json({ error: `Can't move this PO from "${from}" to "${to}".` }, { status: 400 });
    }
    // Every PO on the real "Ready to Ship" board has all six checklist
    // fields complete — a hard gate, enforced here rather than trusted to
    // the UI. Checked against the checklist as it will be after this same
    // request's checklist edits, so "complete the last item + advance" in
    // one request works.
    if (body.status === "ready_to_ship") {
      const incomplete = incompleteChecklistFields(po.backOfficeChecklist as unknown as Record<string, unknown>);
      if (incomplete.length > 0) {
        return NextResponse.json(
          { error: `Back-office checklist incomplete: ${incomplete.join(", ")}` },
          { status: 400 }
        );
      }
    }
    po.status = body.status;
    po.statusHistory.push({
      status: body.status,
      changedAt: new Date(),
      changedBy: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
    });
  }

  if (body.vendorReplySent === true && !po.vendorReplySent) {
    po.vendorReplySent = true;
    if (session.user?.id) po.vendorReplySentBy = new Types.ObjectId(session.user.id);
    po.vendorReplySentAt = new Date();
  }

  if (typeof body.joelShipConfirmed === "boolean") {
    po.joelShipConfirmed = body.joelShipConfirmed;
  }

  await po.save();
  return NextResponse.json({ purchaseOrder: po });
}
