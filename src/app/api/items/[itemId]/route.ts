import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves
import { Types } from "mongoose";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

// GET: single item detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  await connectDB();
  const item = await Item.findById(itemId).populate("vendorId", "name").lean();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH: move an item through the pilot lifecycle — review decision,
// sample SKU assignment, or any other status/field update. One endpoint
// covers all of it since the pilot is driving a handful of fields on the
// same document, not separate sub-resources.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const body = await req.json();
  await connectDB();

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (body.reviewDecision) {
    const { decision, note } = body.reviewDecision as { decision: string; note?: string };
    item.reviewDecision = {
      decision,
      note: note ?? "",
      reviewerId: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
      decidedAt: new Date(),
    };
    item.status = decision === "approved" ? "approved" : "rejected";
    if (decision === "rejected") item.rejectionReason = note ?? null;
  }

  if (body.sampleSku) {
    item.sampleSku = body.sampleSku;
    item.status = "sample_ordered";
  }

  if (body.status) {
    item.status = body.status;
  }

  if (body.itemNumber) {
    item.itemNumber = body.itemNumber;
  }

  if (body.category) {
    item.category = body.category;
  }

  if (body.specs) {
    if (!item.specs) item.set("specs", {});
    Object.assign(item.specs!, body.specs);
  }

  if (body.pricing) {
    const { costPerUnit, msrp, ruePrice } = body.pricing as {
      costPerUnit?: number;
      msrp?: number;
      ruePrice?: number;
    };
    item.pricingHistory.push({ costPerUnit, msrp, ruePrice, source: "manual_update" });
  }

  // Recomputed on every update, not just image/pricing changes, since any
  // of the gated fields (category, specs.metal, pricingHistory, …) can be
  // the one that was missing — see §Master DB completion gate in the blueprint.
  item.masterRecordComplete = isMasterRecordComplete(item);

  await item.save();
  return NextResponse.json({ item });
}
