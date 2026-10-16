import Item from "@/models/Item";

// Performance pass 2026-10-16: the Un-Verified Items list now filters by
// intakeSource and sorts by createdAt, served by a new
// { intakeSource, createdAt } compound index (which also replaces the old
// single-field intakeSource index).
export const name = "2026-10-16-perf-indexes";
export const note = "Item: { intakeSource, createdAt } index for the Un-Verified Items list";

export async function up(): Promise<void> {
  await Item.syncIndexes();
}
