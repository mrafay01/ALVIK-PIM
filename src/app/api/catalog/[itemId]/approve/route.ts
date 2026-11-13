import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import Item from "@/models/Item";
import { isObjectId } from "@/lib/ids";
import { refreshCatalogFacets } from "@/lib/catalog/facets";
import { checkMasterRecordComplete } from "@/lib/masterRecordComplete";
import { notifyAfterResponse } from "@/lib/notifications/notify";
import { catalogApproved } from "@/lib/notifications/messages";

// POST: an admin approves a quotation-origin item that was submitted to the
// catalog. Admin-only (the empty allow-list means "administrator passes,
// nobody else"). One item per call — variations are approved individually.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const gate = await requireRole([]);
  if (isAuthFail(gate)) return gate.response;

  const { itemId } = await params;
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const item = await Item.findById(itemId).lean();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (!item.inCatalog || item.catalogApproval?.status !== "pending") {
    return NextResponse.json({ error: "This item is not pending catalog approval" }, { status: 400 });
  }
  // It was complete when submitted, but may have been edited (or lost an
  // image) since; the catalog only takes complete records.
  const missing = checkMasterRecordComplete(item as unknown as Parameters<typeof checkMasterRecordComplete>[0])
    .filter((c) => !c.ok)
    .map((c) => c.reason ?? c.field);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `This item is no longer complete, so it can't be approved yet: ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const adminId = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;
  // Claimed atomically: two admins approving at once can't both succeed
  // (and send two "approved" emails).
  const approved = await Item.findOneAndUpdate(
    { _id: itemId, inCatalog: true, "catalogApproval.status": "pending" },
    {
      $set: {
        catalogApproval: { status: "approved", ...(adminId ? { approvedBy: adminId } : {}), approvedAt: new Date() },
        ...(adminId ? { lastEditedBy: adminId } : {}),
      },
    },
    { new: true, projection: { itemNumber: 1, title: 1 } }
  ).lean();
  if (!approved) {
    return NextResponse.json({ error: "This item was just approved by someone else." }, { status: 409 });
  }

  refreshCatalogFacets();
  notifyAfterResponse(
    catalogApproved({
      item: { id: String(approved._id), sku: approved.itemNumber, title: approved.title },
      actorId: gate.session.user?.id,
      actorName: gate.session.user?.name,
    })
  );
  return NextResponse.json({ approved: true });
}
