import "@/models/register";
import Item from "@/models/Item";
import CatalogConflict from "@/models/CatalogConflict";
import CatalogChange from "@/models/CatalogChange";

// Catalog conflicts + change log.
//
// What this does:
//   1. syncIndexes() on both new collections so their indexes
//      (CatalogConflict's (itemId,status) compound and TTL on
//      resolvedAt; CatalogChange's (itemId,createdAt) compound)
//      exist on the live cluster.
//   2. Backfills items that pre-date the new conflictCount field with
//      an explicit 0 — the schema default already covers reads, but
//      the (conflictCount) index needs a real value in the document
//      for an indexed query to pick the row up.
export const name = "2026-10-12-catalog-conflicts";
export const note = "create catalog_conflicts + catalog_changes, backfill Item.conflictCount";

export async function up(): Promise<void> {
  await CatalogConflict.syncIndexes();
  await CatalogChange.syncIndexes();

  // Backfill is a no-op on a fresh cluster (nothing to update) and
  // cheap on an existing one (one updateMany, condition on absence of
  // the field so a re-run doesn't touch anything).
  const result = await Item.updateMany(
    { conflictCount: { $exists: false } },
    { $set: { conflictCount: 0 } }
  );
  console.log(`  backfilled conflictCount on ${result.modifiedCount} items`);

  // Pick up the new (conflictCount) index on Item added in the same
  // commit as this migration.
  await Item.syncIndexes();
}
