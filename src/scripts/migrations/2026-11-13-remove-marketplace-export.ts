import type mongoose from "mongoose";
import "@/models/register";

// The Marketplace Export tab was removed on 2026-11-13 (pages, APIs, the
// MarketplaceListing model and the export job). This clears what it left in
// the database:
//   - the marketplacelistings collection (per-item, per-platform listing data)
//   - queued/finished jobs of kind "marketplace_export" and sync_logs of run
//     type "marketplace_export"
//   - the items index on { active, masterRecordComplete }, which only the
//     export's query used (syncIndexes drops it)
// It also renames the "marketplace_listing" role to "catalog_manager" and
// bumps those users' sessionVersion: sessions carry the role from sign-in,
// so they sign in again once and get the new role.
//
// Per-marketplace item descriptions (items.marketplaceDescriptions) are kept.
//
// Uses the native collections: the Job, SyncLog and User schemas no longer
// accept the old values, so Mongoose would refuse or strip these filters.
export const name = "2026-11-13-remove-marketplace-export";
export const note = "Remove Marketplace Export data; rename marketplace_listing role to catalog_manager";

export async function up(db: typeof mongoose): Promise<void> {
  const native = db.connection.db!;

  const existing = new Set((await native.listCollections().toArray()).map((c) => c.name));
  if (existing.has("marketplacelistings")) {
    const n = await native.collection("marketplacelistings").countDocuments();
    await native.dropCollection("marketplacelistings");
    console.log(`  dropped collection marketplacelistings (${n} document(s))`);
  }

  const jobs = await native.collection("jobs").deleteMany({ kind: "marketplace_export" });
  if (jobs.deletedCount > 0) console.log(`  jobs: deleted ${jobs.deletedCount} marketplace_export job(s)`);

  const logs = await native.collection("synclogs").deleteMany({ runType: "marketplace_export" });
  if (logs.deletedCount > 0) console.log(`  synclogs: deleted ${logs.deletedCount} marketplace_export log(s)`);

  const users = await native
    .collection("users")
    .updateMany({ role: "marketplace_listing" }, { $set: { role: "catalog_manager" }, $inc: { sessionVersion: 1 } });
  console.log(`  users: renamed role on ${users.modifiedCount} user(s) to catalog_manager`);

  const dropped = await db.models.Item.syncIndexes();
  if (dropped.length > 0) console.log(`  Item: dropped indexes ${dropped.join(", ")}`);
}
