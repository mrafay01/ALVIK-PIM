import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import PurchaseOrder from "@/models/PurchaseOrder";
import { syncPurchaseOrderToMonday } from "@/lib/monday/sync";
import { MondayApiError } from "@/lib/monday/client";

// POST: push a single PO to its Monday.com board item now, rather than
// waiting for the bulk sync — used by a "sync to Monday" button on the PO
// detail screen.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;

  const { poId } = await params;
  await connectDB();

  const po = await PurchaseOrder.findById(poId);
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  try {
    const result = await syncPurchaseOrderToMonday(po);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof MondayApiError ? err.message : "Monday sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
