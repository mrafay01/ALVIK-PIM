import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { updateBatchStatus } from "@/lib/import/commitRows";

// Imports no longer keep rows that have been dealt with: a committed row's
// values live on its catalog item, and an excluded row will never be
// imported. This removes such rows left by earlier imports, keeping each
// import's committed / excluded figures as plain counts.
export const name = "2026-10-22-purge-handled-import-rows";
export const note = "delete committed/excluded Master File rows; keep their counts on the import";

export async function up(): Promise<void> {
  const batches = await ImportBatch.find({}).select("_id").lean();
  for (const b of batches) {
    const [committed, excluded] = await Promise.all([
      ImportBatchRow.countDocuments({ batchId: b._id, committedItemId: { $ne: null } }),
      ImportBatchRow.countDocuments({ batchId: b._id, committedItemId: null, reviewStatus: "rejected" }),
    ]);
    await ImportBatch.updateOne({ _id: b._id }, { $set: { approvedRows: committed, rejectedRows: excluded } });
    await ImportBatchRow.deleteMany({
      batchId: b._id,
      $or: [{ committedItemId: { $ne: null } }, { reviewStatus: "rejected" }],
    });
    await updateBatchStatus([String(b._id)]);
    console.log(`  import ${b._id}: kept counts (${committed} committed, ${excluded} excluded), removed those rows`);
  }
}
