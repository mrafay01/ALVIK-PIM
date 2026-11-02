import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { isObjectId } from "@/lib/ids";
import { archiveMondayFiles } from "@/lib/purchase-orders/files";
import PurchaseOrder from "@/models/PurchaseOrder";
import logger from "@/lib/logger";

// Copying one PO's Monday files into its SharePoint folder now, from the PO
// page ("Copy to SharePoint"). Same copy as the Monday Import screen's bulk
// run, limited to this PO and to ~40 seconds per call.
export const maxDuration = 60;

// POST: copy what's left of this PO's Monday files.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ poId: string }> }) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;

  const { poId } = await params;
  if (!isObjectId(poId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  if (!(await PurchaseOrder.exists({ _id: poId }))) {
    return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  }

  try {
    return NextResponse.json(await archiveMondayFiles({ timeBudgetMs: 40_000, poId: new Types.ObjectId(poId) }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("PO file copy failed", { poId, error: message });
    return NextResponse.json({ error: "Couldn't reach SharePoint. Try again in a moment." }, { status: 502 });
  }
}
