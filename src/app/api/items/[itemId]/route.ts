import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { ItemPatchSchema, ITEM_TRANSITIONS, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { Types } from "mongoose";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

// GET: single item detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

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
  const gate = await requireRole(ROLE_SETS.items);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { itemId } = await params;
  const parsed = ItemPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  await connectDB();

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (body.reviewDecision) {
    const { decision, note } = body.reviewDecision;
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
    // Guard the lifecycle: only declared transitions from the item's
    // current status are allowed — the field used to be assigned verbatim.
    const allowed = ITEM_TRANSITIONS[item.status as string] ?? [];
    if (body.status !== item.status && !allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot move item from "${item.status}" to "${body.status}"` },
        { status: 400 }
      );
    }
    item.status = body.status;
  }

  if (body.itemNumber) {
    item.itemNumber = body.itemNumber;
  }

  if (body.category) {
    item.category = body.category;
  }

  if (body.title !== undefined) item.title = body.title;
  if (body.description !== undefined) item.description = body.description;
  if (body.brand !== undefined) item.brand = body.brand;
  if (body.upc !== undefined) item.upc = body.upc;
  if (body.bulletFeatures !== undefined) item.bulletFeatures = body.bulletFeatures;

  if (body.specs) {
    if (!item.specs) item.set("specs", {});
    Object.assign(item.specs!, body.specs);
  }

  if (body.pricing) {
    const { costPerUnit, msrp, ruePrice } = body.pricing;
    item.pricingHistory.push({ costPerUnit, msrp, ruePrice, source: "manual_update" });
  }

  // Recomputed on every update, not just image/pricing changes, since any
  // of the gated fields (category, specs.metal, pricingHistory, …) can be
  // the one that was missing — see §Master DB completion gate in the blueprint.
  item.masterRecordComplete = isMasterRecordComplete(item);

  await item.save();
  return NextResponse.json({ item });
}
