import { NextRequest, NextResponse } from "next/server";
import { isObjectId } from "@/lib/ids";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import PurchaseOrder from "@/models/PurchaseOrder";
import { syncPurchaseOrderToMonday } from "@/lib/monday/sync";
import { MondayApiError } from "@/lib/monday/client";
import { isClosedOnMonday } from "@/lib/purchase-orders/transitions";
import logger from "@/lib/logger";
import { notifyAfterResponse } from "@/lib/notifications/notify";
import { mondaySyncFailed } from "@/lib/notifications/messages";

// POST: push a single PO to its Monday.com board item now — the "Sync to
// Monday" button on the PO detail screen. Creates the board item the first
// time, updates it in place after that.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ poId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;

  const { poId } = await params;
  if (!isObjectId(poId)) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  await connectDB();

  const po = await PurchaseOrder.findById(poId);
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  if (isClosedOnMonday(po.mondayStatusText)) {
    return NextResponse.json(
      { error: `This PO is marked "${po.mondayStatusText}" on Monday; there's nothing to push.` },
      { status: 409 }
    );
  }

  try {
    const result = await syncPurchaseOrderToMonday(po);
    return NextResponse.json({ ...result, lastPushedToMondayAt: po.lastPushedToMondayAt });
  } catch (err) {
    logger.error("Monday push failed", { poId, error: err instanceof Error ? err.message : String(err) });
    const message =
      err instanceof MondayApiError
        ? `Monday rejected the update: ${err.message}`
        : "Couldn't reach Monday.com. Check the connection and try again.";
    notifyAfterResponse(
      mondaySyncFailed({
        what: "push",
        failed: 1,
        messages: [`PO-${po.poNumber}: ${message}`],
        actorId: gate.session.user?.id,
        actorName: gate.session.user?.name,
      })
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
