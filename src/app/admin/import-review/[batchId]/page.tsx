import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { ReviewTable } from "./ReviewTable";

export default async function BatchReviewPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean().exec();
  if (!batch) notFound();

  // Rows live in their own collection (see ImportBatchRow.ts), not embedded
  // in the batch document — fetched separately here.
  const rows = await ImportBatchRow.find({ batchId }).sort({ rowNumber: 1 }).lean();

  return (
    <AppShell activeHref="/admin/import-review" eyebrow="Data migration" title={batch.sourceFileName}>
      <p className="text-ink-soft mb-6 text-[0.92rem]">
        {batch.totalRows} rows · {batch.flaggedRows} flagged for attention · status:{" "}
        <span className="capitalize">{batch.status.replace(/_/g, " ")}</span>
      </p>
      <ReviewTable batchId={String(batch._id)} rows={JSON.parse(JSON.stringify(rows))} />
    </AppShell>
  );
}
