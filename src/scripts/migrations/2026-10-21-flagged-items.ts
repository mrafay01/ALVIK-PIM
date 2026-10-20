import ImportBatchRow from "@/models/ImportBatchRow";

// Flagged Items page: index for parked, uncommitted Master File rows.
export const name = "2026-10-21-flagged-items";
export const note = "ImportBatchRow: { parkedAt, committedItemId } index for Flagged Items";

export async function up(): Promise<void> {
  await ImportBatchRow.syncIndexes();
}
