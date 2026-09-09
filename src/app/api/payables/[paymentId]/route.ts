import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { PaymentPatchSchema, badRequest } from "@/lib/schemas";
import Payment from "@/models/Payment";

// GET: single payment detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.payables);
  if (isAuthFail(gate)) return gate.response;

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
  const gate = await requireRole(ROLE_SETS.payables);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { paymentId } = await params;
  const parsed = PaymentPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;
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
