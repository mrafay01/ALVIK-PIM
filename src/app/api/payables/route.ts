import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Payment from "@/models/Payment";
import Vendor from "@/models/Vendor";
import PurchaseOrder from "@/models/PurchaseOrder";

// GET: list payments, most recently updated first. Supports ?status=... filter.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
  const query = status ? { status } : {};
  const payments = await Payment.find(query)
    .populate("vendorId", "name")
    .populate("poId", "poNumber")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ payments });
}

// POST: record a payment tranche against a PO — deposit, balance, prepayment,
// or credit. Due date defaults from the vendor's paymentTermsDays when not
// given explicitly, per the blueprint's "due-date calc from vendor terms".
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { poId, vendorId, tranche, invoiceRef, amountDue, dueDate, creditAppliedFrom } = body;

  if (!poId || !vendorId || !tranche) {
    return NextResponse.json({ error: "poId, vendorId and tranche are required" }, { status: 400 });
  }

  await connectDB();

  const po = await PurchaseOrder.findById(poId);
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  let resolvedDueDate = dueDate ? new Date(dueDate) : undefined;
  if (!resolvedDueDate) {
    const vendor = await Vendor.findById(vendorId);
    if (vendor?.paymentTermsDays) {
      resolvedDueDate = new Date(Date.now() + vendor.paymentTermsDays * 24 * 60 * 60 * 1000);
    }
  }

  const payment = await Payment.create({
    poId,
    vendorId,
    tranche,
    invoiceRef,
    amountDue,
    dueDate: resolvedDueDate,
    status: tranche === "deposit" ? "deposit_submitted" : "open",
    creditAppliedFrom: creditAppliedFrom || null,
    recordedBy: session.user?.id || undefined,
  });

  return NextResponse.json({ payment }, { status: 201 });
}
