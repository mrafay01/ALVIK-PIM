import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import Item from "@/models/Item";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { isObjectId } from "@/lib/ids";
import { refreshCatalogFacets } from "@/lib/catalog/facets";
import { notifyAfterResponse } from "@/lib/notifications/notify";
import { catalogSubmitted } from "@/lib/notifications/messages";

const CATALOG_ROLES = ["catalog_manager"] as const;

// POST: submit a quotation-origin item to the finalized catalog. It enters
// as `inCatalog` with a pending approval; an admin approves it separately
// (POST /api/catalog/[itemId]/approve). Master File and manually-added
// items don't use this — they're in the catalog directly.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const gate = await requireRole([...CATALOG_ROLES]);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { itemId } = await params;
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (item.inCatalog) {
    return NextResponse.json({ error: "This item is already in the catalog" }, { status: 400 });
  }
  if (!isMasterRecordComplete(item)) {
    return NextResponse.json(
      { error: "The item's master record isn't complete yet. Fill in the missing fields first" },
      { status: 400 }
    );
  }

  item.inCatalog = true;
  item.catalogApproval = { status: "pending" };
  item.catalogSubmittedAt = new Date();
  if (session.user?.id) item.lastEditedBy = new Types.ObjectId(session.user.id);
  await item.save();

  refreshCatalogFacets();
  notifyAfterResponse(
    catalogSubmitted({
      item: { id: String(item._id), sku: item.itemNumber, title: item.title },
      actorId: session.user?.id,
      actorName: session.user?.name,
    })
  );
  return NextResponse.json({ submitted: true });
}
