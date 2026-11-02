import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { PoCreateSchema, badRequest } from "@/lib/schemas";
import PurchaseOrder from "@/models/PurchaseOrder";
import Item from "@/models/Item";
import { formatPoNumber } from "@/lib/purchase-orders/poNumber";
import Vendor from "@/models/Vendor";

// POST: create a PO/PI for one or more items — the next step in the pilot
// after an item has an approved review decision and a sample SKU. This is
// part of the item intake flow (driven from /items/[itemId]), so item
// roles can create the PO; advancing it through the pipeline afterwards is
// still buying/purchasing only (see [poId]/route.ts).
export async function POST(req: NextRequest) {
  const gate = await requireRole([...ROLE_SETS.items, ...ROLE_SETS.purchaseOrders]);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const parsed = PoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { vendorId, orderPurposeCategory, priority, itemId, qty, unitCost } = parsed.data;
  // Stored as the bare number, like quote-created and Monday POs, so the same
  // PO typed two ways ("22906" / "PO-22906" / "#22906") can't become two records.
  const poNumber = formatPoNumber(parsed.data.poNumber);
  if (!poNumber) return NextResponse.json({ error: "Enter a PO number" }, { status: 400 });

  await connectDB();

  const [item, vendorExists] = await Promise.all([Item.findById(itemId), Vendor.exists({ _id: vendorId })]);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (!vendorExists) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });

  const totalCost = qty && unitCost ? Number(qty) * Number(unitCost) : undefined;

  // Creating the PO and flipping the item's status are one logical unit —
  // wrap them in a transaction so a failure on the second write can't leave
  // a PO pointing at an item still marked "quoted"/"sample_ordered".
  const dbSession = await mongoose.startSession();
  let po;
  try {
    await dbSession.withTransaction(async () => {
      const created = await PurchaseOrder.create(
        [
          {
            poNumber,
            vendorId,
            source: "manual",
            orderPurpose: { category: orderPurposeCategory },
            priority: priority || "medium",
            lineItems: [
              { itemId: item._id, qty: qty || undefined, unitCost: unitCost || undefined, totalCost },
            ],
            status: "waiting_for_sample_po",
            orderDate: new Date(),
            poTotal: totalCost,
            statusHistory: [
              { status: "waiting_for_sample_po", changedBy: session.user?.id || undefined },
            ],
          },
        ],
        { session: dbSession }
      );
      po = created[0];
      // A catalog item keeps its own status; only a pipeline item moves on.
      if (!item.inCatalog) {
        item.status = "po_sent";
        await item.save({ session: dbSession });
      }
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: `PO number "${poNumber}" already exists` }, { status: 409 });
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  return NextResponse.json({ purchaseOrder: po }, { status: 201 });
}
