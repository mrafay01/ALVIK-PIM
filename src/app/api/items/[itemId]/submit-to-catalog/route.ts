import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import Item from "@/models/Item";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

const CATALOG_ROLES = ["marketplace_listing"] as const;

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

  const { itemId } = await params;
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (item.inCatalog) {
    return NextResponse.json({ error: "This item is already in the catalog" }, { status: 400 });
  }
  if (!isMasterRecordComplete(item)) {
    return NextResponse.json(
      { error: "The item's master record isn't complete yet — fill in the missing fields first" },
      { status: 400 }
    );
  }

  item.inCatalog = true;
  item.catalogApproval = { status: "pending" };
  item.catalogSubmittedAt = new Date();
  await item.save();

  return NextResponse.json({ submitted: true });
}
