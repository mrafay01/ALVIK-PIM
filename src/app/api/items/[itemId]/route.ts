import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { ItemPatchSchema, ITEM_TRANSITIONS, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { Types } from "mongoose";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { validateItemMeasurements, formatValidationIssues } from "@/lib/measurements/validate";
import { isObjectId } from "@/lib/ids";
import { refreshCatalogFacets } from "@/lib/catalog/facets";
import { AUTHORITATIVE_FIELDS, getByPath, valuesConflict } from "@/lib/catalog/authoritativeFields";
import CatalogChange from "@/models/CatalogChange";
import logger from "@/lib/logger";

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

// A manual edit counts as a change when a value is set, cleared or
// different (weights compared at 2 decimals, like PI reconciliation).
function editedValueChanged(kind: "weight" | "number" | "text", before: unknown, after: unknown): boolean {
  if (isEmptyValue(before) && isEmptyValue(after)) return false;
  if (isEmptyValue(before) !== isEmptyValue(after)) return true;
  return valuesConflict(kind, before, after);
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
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = ItemPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  await connectDB();

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  // Authoritative values before this edit, for the catalog's change history.
  const before = item.toObject();

  if (body.reviewDecision) {
    const { decision, note } = body.reviewDecision;
    // A review decision is a lifecycle move like any other: it can't, for
    // example, reject an item that's already live.
    const target = decision === "approved" ? "approved" : "rejected";
    const allowed = ITEM_TRANSITIONS[item.status as string] ?? [];
    if (item.status !== target && !allowed.includes(target)) {
      return NextResponse.json({ error: `An item that is "${item.status}" can't be ${target} now` }, { status: 400 });
    }
    item.reviewDecision = {
      decision,
      note: note ?? "",
      reviewerId: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
      decidedAt: new Date(),
    };
    item.status = target;
    if (decision === "rejected") item.rejectionReason = note || undefined;
    else item.rejectionReason = undefined;
  }

  if (body.sampleSku) {
    item.sampleSku = body.sampleSku;
    // Assigning a sample SKU moves the item to "sample ordered" only from a
    // status where that's the next step; otherwise just the SKU is set.
    if ((ITEM_TRANSITIONS[item.status as string] ?? []).includes("sample_ordered")) item.status = "sample_ordered";
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

  if (body.itemNumber && body.itemNumber !== item.itemNumber) {
    // Case-insensitive, like the catalog's new-item check: SharePoint folder
    // names ignore case, so "A1234" and "a1234" would share image folders.
    const clash = await Item.findOne({ itemNumber: body.itemNumber, _id: { $ne: item._id } })
      .collation({ locale: "en", strength: 2 })
      .select("itemNumber")
      .lean();
    if (clash) {
      return NextResponse.json({ error: `Item number "${clash.itemNumber}" is already used by another item` }, { status: 409 });
    }
    item.itemNumber = body.itemNumber;
  }

  if (body.vendorSku !== undefined) item.vendorSku = body.vendorSku;

  if (body.category) {
    item.category = body.category;
  }

  if (body.collectionName !== undefined) item.collectionName = body.collectionName;
  if (body.season !== undefined) item.season = body.season;
  if (body.boxNumber !== undefined) item.boxNumber = body.boxNumber;

  if (body.active !== undefined) item.active = body.active;

  if (body.marketplaceDescription) {
    const { platform, text } = body.marketplaceDescription;
    if (!item.marketplaceDescriptions) item.set("marketplaceDescriptions", new Map());
    item.marketplaceDescriptions!.set(platform, {
      text,
      source: "manual",
      updatedBy: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
      updatedAt: new Date(),
    });
  }

  if (body.title !== undefined) item.title = body.title;
  if (body.title2 !== undefined) item.title2 = body.title2;
  if (body.description !== undefined) item.description = body.description;
  if (body.description2 !== undefined) item.description2 = body.description2;
  if (body.brand !== undefined) item.brand = body.brand;
  if (body.upc !== undefined) item.upc = body.upc;
  if (body.upc2 !== undefined) item.upc2 = body.upc2;
  if (body.aliasSku !== undefined) item.aliasSku = body.aliasSku;
  if (body.bulletFeatures !== undefined) item.bulletFeatures = body.bulletFeatures;

  if (body.specs) {
    if (!item.specs) item.set("specs", {});
    Object.assign(item.specs!, body.specs);
  }

  if (body.measurements) {
    const effectiveCategory = body.category ?? item.category;
    const result = validateItemMeasurements(body.measurements, effectiveCategory);
    if (!result.valid) {
      return NextResponse.json(
        { error: formatValidationIssues(result.issues), details: result.issues },
        { status: 400 }
      );
    }
    item.set("measurements", { ...body.measurements, category: effectiveCategory });
  }

  if (body.pricing) {
    const { costPerUnit, msrp, ruePrice } = body.pricing;
    item.pricingHistory.push({ costPerUnit, msrp, ruePrice, source: "manual_update" });
  }

  // Recomputed on every update, not just image/pricing changes, since any
  // of the gated fields (category, specs.metal, pricingHistory, …) can be
  // the one that was missing — see §Master DB completion gate in the blueprint.
  item.masterRecordComplete = isMasterRecordComplete(item);

  if (session.user?.id) item.lastEditedBy = new Types.ObjectId(session.user.id);

  try {
    await item.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: `Item number "${item.itemNumber}" is already used by another item` },
        { status: 409 }
      );
    }
    throw err;
  }
  // The catalog is the source of truth: every change to an authoritative
  // field of a catalog item is logged (Change history on the item page).
  if (item.inCatalog) {
    const userId = session.user?.id ? new Types.ObjectId(session.user.id) : null;
    const changes = AUTHORITATIVE_FIELDS.flatMap((f) => {
      const oldValue = getByPath(before, f.path);
      const newValue = item.get(f.path);
      if (!editedValueChanged(f.kind, oldValue, newValue)) return [];
      return [{ itemId: item._id, field: f.path, fieldLabel: f.label, oldValue: oldValue ?? null, newValue: newValue ?? null, source: "manual_edit" as const, sourceRef: { userId } }];
    });
    if (changes.length > 0) {
      // The edit itself is saved; a failed log write is reported, not fatal.
      await CatalogChange.insertMany(changes).catch((err) =>
        logger.error("item edit: writing the change history failed", {
          itemId: String(item._id),
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    refreshCatalogFacets();
  }
  return NextResponse.json({ item });
}
