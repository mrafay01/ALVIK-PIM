import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import Item from "@/models/Item";

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
  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (!item.inCatalog || item.catalogApproval?.status !== "pending") {
    return NextResponse.json(
      { error: "This item is not pending catalog approval" },
      { status: 400 }
    );
  }

  item.catalogApproval = {
    status: "approved",
    approvedBy: gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined,
    approvedAt: new Date(),
  };
  await item.save();

  return NextResponse.json({ approved: true });
}
