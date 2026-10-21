import type mongoose from "mongoose";
import "@/models/register";

// Database slim-down (2026-10-23 audit). Removes data nothing reads and
// indexes nothing queries:
//   - staged import/quote rows: the `raw` copy of each spreadsheet row
//     (never read; flags keep their own rawValue, the file is the record)
//   - items / POs / quotes / vendors: fields stored as null or [] by old
//     schema defaults, plus fields that were removed from the schema
//   - the empty, unused shipments / receivinglogs / platformtemplates
//     collections
//   - indexes no query uses, or that a compound index already covers
//     (syncIndexes drops every index the schemas no longer declare, and
//     creates the new sync_logs TTL)
//
// Uses the native collection for the $unsets: Mongoose strips update paths
// that aren't in the schema any more, which would make them no-ops.
export const name = "2026-10-23-slim-database";
export const note = "drop unused fields, null defaults, empty collections and unused indexes";

async function unsetWhere(
  db: typeof mongoose,
  collection: string,
  filter: Record<string, unknown>,
  fields: string[]
): Promise<void> {
  const unset = Object.fromEntries(fields.map((f) => [f, ""]));
  const r = await db.connection.db!.collection(collection).updateMany(filter, { $unset: unset });
  if (r.modifiedCount > 0) console.log(`  ${collection}: removed ${fields.join(", ")} from ${r.modifiedCount} doc(s)`);
}

// Unset each field only on documents where it's stored as null.
async function unsetNulls(db: typeof mongoose, collection: string, fields: string[]): Promise<void> {
  for (const f of fields) await unsetWhere(db, collection, { [f]: { $type: "null" } }, [f]);
}

export async function up(db: typeof mongoose): Promise<void> {
  // Staged rows: the raw row copy.
  await unsetWhere(db, "importbatchrows", { raw: { $exists: true } }, ["raw"]);
  await unsetWhere(db, "quotationrows", { raw: { $exists: true } }, ["raw"]);

  // Items.
  await unsetWhere(db, "items", { mondayItemId: { $exists: true } }, ["mondayItemId"]);
  await unsetNulls(db, "items", [
    "boxNumber",
    "rejectionReason",
    "intakeSource",
    "sourcePoNumber",
    "sourceMondayItemId",
    "sourceMondayStatus",
    "lastEditedBy",
  ]);
  await unsetWhere(db, "items", { costHistory: { $size: 0 } }, ["costHistory"]);
  await unsetWhere(db, "items", { "specs.stoneInfo": { $size: 0 } }, ["specs.stoneInfo"]);

  // Purchase orders: shipmentId was never set (shipment grouping isn't built).
  await unsetWhere(db, "purchaseorders", { shipmentId: { $exists: true } }, ["shipmentId"]);

  // Quotes: fields nothing reads any more (the quote forms no longer ask
  // for a season or received date), and null placeholders.
  const legacyQuoteFields = ["sourceFileUrl", "importStatus", "receivedDate", "season"];
  await unsetWhere(db, "quotations", { $or: legacyQuoteFields.map((f) => ({ [f]: { $exists: true } })) }, legacyQuoteFields);
  await unsetNulls(db, "quotations", ["commitLockedAt", "sourceFileName"]);

  // Vendors: payment terms went with the payables module.
  await unsetWhere(db, "vendors", { paymentTermsDays: { $exists: true } }, ["paymentTermsDays"]);

  // Empty collections whose models were removed. Only dropped while empty.
  const existing = new Set((await db.connection.db!.listCollections().toArray()).map((c) => c.name));
  for (const c of ["shipments", "receivinglogs", "platformtemplates"]) {
    if (!existing.has(c)) continue;
    const n = await db.connection.db!.collection(c).countDocuments();
    if (n > 0) {
      console.log(`  ${c}: has ${n} document(s), left in place`);
      continue;
    }
    await db.connection.db!.dropCollection(c);
    console.log(`  dropped empty collection ${c}`);
  }

  // Bring every collection's indexes in line with its schema.
  for (const [n, Model] of Object.entries(db.models)) {
    const dropped = await Model.syncIndexes();
    if (dropped.length > 0) console.log(`  ${n}: dropped indexes ${dropped.join(", ")}`);
  }
}
