import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Payment from "@/models/Payment";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves
import "@/models/PurchaseOrder"; // registers the PurchaseOrder schema so .populate("poId") resolves

// GET: single payment detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paymentId } = await params;
  await connectDB();
  const payment = await Payment.findById(paymentId)
    .populate("vendorId", "name")
    .populate("poId", "poNumber")
    .lean();
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  return NextResponse.json({ payment });
}

// PATCH: record a payment method/proof-of-payment and mark paid, or archive.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paymentId } = await params;
  const body = await req.json();
  await connectDB();

  const payment = await Payment.findById(paymentId);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  if (body.paymentMethod) payment.paymentMethod = body.paymentMethod;
  if (body.proofOfPaymentUrl) payment.proofOfPaymentUrl = body.proofOfPaymentUrl;

  if (body.status === "paid") {
    payment.status = "paid";
    payment.paidAt = new Date();
    if (session.user?.id) payment.recordedBy = new Types.ObjectId(session.user.id);
  } else if (body.status === "archived") {
    payment.status = "archived";
  }

  await payment.save();
  return NextResponse.json({ payment });
}
