import type mongoose from "mongoose";
import "@/models/register";

// First migration: materialize every schema's index set against the
// live cluster. New indexes added to any model (e.g. the perf pass's
// (status, updatedAt) compound on PurchaseOrder) only exist in the
// schema until a syncIndexes() runs, which an app-startup .ensureIndexes
// call does lazily in dev but doesn't do automatically in production.
export const name = "2026-10-12-ensure-indexes";
export const note = "sync model indexes with the live collection set";

export async function up(db: typeof mongoose): Promise<void> {
  const names = Object.keys(db.models);
  for (const n of names) {
    const Model = db.models[n];
    // syncIndexes drops indexes that aren't in the schema and creates
    // ones that are missing — the atomic bring-the-cluster-into-line op.
    // Each model runs independently so one slow build doesn't block the
    // others, and errors are reported with the model name attached.
    try {
      await Model.syncIndexes();
      console.log(`  indexes synced: ${n}`);
    } catch (err) {
      console.error(`  index sync failed for ${n}:`, err);
      throw err;
    }
  }
}
