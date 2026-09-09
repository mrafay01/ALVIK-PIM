import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import Item from "@/models/Item";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves

// GET: list purchase orders, most recently updated first.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const pos = await PurchaseOrder.find({})
    .select("poNumber vendorId status orderPurpose priority poTotal updatedAt")
    .populate("vendorId", "name")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ purchaseOrders: pos });
}

// POST: create a PO/PI for one or more items — the next step in the pilot
// after an item has an approved review decision and a sample SKU.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { poNumber, vendorId, orderPurposeCategory, priority, itemId, qty, unitCost } = body;

  if (!poNumber || !vendorId || !orderPurposeCategory || !itemId) {
    return NextResponse.json(
      { error: "poNumber, vendorId, orderPurposeCategory and itemId are required" },
      { status: 400 }
    );
  }

  await connectDB();

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const totalCost = qty && unitCost ? Number(qty) * Number(unitCost) : undefined;

  const po = await PurchaseOrder.create({
    poNumber,
    vendorId,
    orderPurpose: { category: orderPurposeCategory },
    priority: priority || "medium",
    lineItems: [{ itemId: item._id, qty: qty || undefined, unitCost: unitCost || undefined, totalCost }],
    status: "waiting_for_sample_po",
    orderDate: new Date(),
    poTotal: totalCost,
    statusHistory: [{ status: "waiting_for_sample_po", changedBy: session.user?.id || undefined }],
  });

  item.status = "po_sent";
  await item.save();

  return NextResponse.json({ purchaseOrder: po }, { status: 201 });
}
