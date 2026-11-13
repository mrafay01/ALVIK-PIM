import { NextRequest, NextResponse } from "next/server";
import { Types, Error as MongooseError } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { ConflictResolveSchema, badRequest } from "@/lib/schemas";
import CatalogConflict from "@/models/CatalogConflict";
import CatalogChange from "@/models/CatalogChange";
import Item from "@/models/Item";
import type { ConflictStatus } from "@/models/CatalogConflict";
import { AUTHORITATIVE_FIELD_BY_PATH, getByPath, valuesConflict } from "@/lib/catalog/authoritativeFields";
import { isObjectId } from "@/lib/ids";

const CONFLICT_ROLES = ["catalog_manager"] as const;

// POST /api/catalog/conflicts/[conflictId]/resolve
//
// Body: { decision: "keep" | "accept" } or { decision: "custom", customValue }
//
// `keep`   — close the conflict, don't touch the item
// `accept` — write `incomingValue` to the item's field + log the change
// `custom` — write the reviewer-typed value instead + log the change
//
// Decrements item.conflictCount in every branch (one less open
// conflict on this item regardless of which side won). Idempotent on
// re-POST: if the conflict is already not-pending, returns the current
// state without re-writing anything.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conflictId: string }> }
) {
  const gate = await requireRole([...CONFLICT_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { conflictId } = await params;
  if (!isObjectId(conflictId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = ConflictResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  await connectDB();
  const existing = await CatalogConflict.findById(conflictId).lean();
  if (!existing) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  if (existing.status !== "pending") {
    // Already resolved — report the current state without double-
    // decrementing conflictCount or re-writing the item.
    return NextResponse.json({ conflict: existing });
  }

  const authField = AUTHORITATIVE_FIELD_BY_PATH[existing.field];

  // Pick the outcome and the value we're going to write (null for "keep").
  // A conflict on a field that's since been removed from
  // AUTHORITATIVE_FIELDS is closed as kept.
  let newValue: unknown = null;
  let nextStatus: ConflictStatus;
  const decision = authField ? parsed.data.decision : "keep";
  if (decision === "keep") {
    nextStatus = "kept_existing";
  } else if (decision === "accept") {
    nextStatus = "accepted_new";
    newValue = existing.incomingValue;
  } else {
    nextStatus = "custom";
    const raw = parsed.data.decision === "custom" ? parsed.data.customValue : null;
    // The typed value has to fit the field: a weight is a number >= 0,
    // anything else non-empty text. Checked before the conflict is closed.
    if (authField.kind === "weight" || authField.kind === "number") {
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
      if (String(raw ?? "").trim() === "" || !Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `Enter a number for ${authField.label}` }, { status: 400 });
      }
      newValue = n;
    } else {
      const text = String(raw ?? "").trim();
      if (!text) return NextResponse.json({ error: `Enter a value for ${authField.label}` }, { status: 400 });
      newValue = text;
    }
  }

  const resolvedBy = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;

  // Claim the conflict atomically: only the request that flips it out of
  // "pending" goes on to write the item and decrement its counter, so two
  // reviewers clicking at the same moment can't both apply a value.
  const conflict = await CatalogConflict.findOneAndUpdate(
    { _id: conflictId, status: "pending" },
    {
      $set: {
        status: nextStatus,
        resolvedAt: new Date(),
        ...(resolvedBy ? { resolvedBy } : {}),
        ...(nextStatus === "custom" ? { customValue: newValue } : {}),
      },
    },
    { new: true }
  );
  if (!conflict) {
    const current = await CatalogConflict.findById(conflictId).lean();
    return NextResponse.json({ conflict: current });
  }

  if (nextStatus !== "kept_existing") {
    // The item is loaded fresh so the change log records the value that
    // was actually replaced, not the conflict's possibly-stale snapshot.
    const item = await Item.findById(conflict.itemId);
    const oldValue = item ? getByPath(item.toObject({ depopulate: true }), conflict.field) : undefined;
    // Nothing to write when the item already holds this value (it was
    // changed since the PI came in): close the conflict without logging a
    // "change" from a value to itself.
    const alreadyThere = item && authField && !valuesConflict(authField.kind, oldValue, newValue) && oldValue != null;
    if (item && !alreadyThere) {
      item.set(conflict.field, newValue);
      if (resolvedBy) item.lastEditedBy = resolvedBy;
      try {
        await item.save();
      } catch (err) {
        // The item wasn't changed, so the conflict isn't resolved either.
        await CatalogConflict.updateOne(
          { _id: conflict._id, status: nextStatus },
          { $set: { status: "pending" }, $unset: { resolvedAt: "", resolvedBy: "", customValue: "" } }
        );
        if (err instanceof MongooseError.ValidationError) {
          return NextResponse.json(
            { error: `The item wouldn't accept that value for ${conflict.fieldLabel}. Try another value.` },
            { status: 400 }
          );
        }
        throw err;
      }

      await CatalogChange.create({
        itemId: conflict.itemId,
        field: conflict.field,
        fieldLabel: conflict.fieldLabel,
        oldValue,
        newValue,
        source: "pi_conflict",
        sourceRef: {
          quotationId: conflict.quotationId,
          quotationRowId: conflict.quotationRowId,
          catalogConflictId: conflict._id,
          userId: resolvedBy ?? null,
        },
      });
    }
  }

  await Item.updateOne(
    { _id: conflict.itemId, conflictCount: { $gt: 0 } },
    { $inc: { conflictCount: -1 } }
  );

  return NextResponse.json({ conflict });
}
