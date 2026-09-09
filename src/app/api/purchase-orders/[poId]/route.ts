import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves
import "@/models/Item"; // registers the Item schema so .populate("lineItems.itemId") resolves

// GET: single PO detail, with line-item and vendor references populated.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { poId } = await params;
  await connectDB();
  const po = await PurchaseOrder.findById(poId)
    .populate("vendorId", "name")
    .populate("lineItems.itemId", "itemNumber sampleSku vendorSku status")
    .lean();
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  return NextResponse.json({ purchaseOrder: po });
}

// PATCH: advance the PO through the 8-stage pipeline (§ blueprint), or
// update the back-office checklist. Every status change is appended to
// statusHistory so the pipeline stays auditable, matching how it worked
// on the Monday.com boards this replaces.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { poId } = await params;
  const body = await req.json();
  await connectDB();

  const po = await PurchaseOrder.findById(poId);
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  if (body.backOfficeChecklist) {
    Object.assign(po.backOfficeChecklist, body.backOfficeChecklist);
  }

  if (body.status) {
    // The blueprint notes every PO on the real "Ready to Ship" board has
    // all six checklist fields complete with zero exceptions — a hard
    // gate, not an informal one. Block the transition server-side rather
    // than trusting a manual status change.
    if (body.status === "ready_to_ship") {
      const checklist = po.backOfficeChecklist;
      const incomplete = Object.entries({
        images: checklist?.images === "received",
        data: checklist?.data === "received",
        pricing: checklist?.pricing === "confirmed",
        jmUpdate: checklist?.jmUpdate === "updated",
        onMaster: checklist?.onMaster === "done",
        descriptions: checklist?.descriptions === "done",
      })
        .filter(([, done]) => !done)
        .map(([field]) => field);
      if (incomplete.length > 0) {
        return NextResponse.json(
          { error: `Back-office checklist incomplete: ${incomplete.join(", ")}` },
          { status: 400 }
        );
      }
    }
    po.status = body.status;
    po.statusHistory.push({ status: body.status, changedBy: session.user?.id || undefined });
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
