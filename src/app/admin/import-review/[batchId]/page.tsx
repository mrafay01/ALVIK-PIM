import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { ReviewTable } from "./ReviewTable";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";

type Filter = "all" | "flagged" | "needs_review";

function filterToQuery(batchId: string, filter: Filter): Record<string, unknown> {
  if (filter === "flagged") return { batchId, "flags.0": { $exists: true } };
  if (filter === "needs_review") return { batchId, reviewStatus: "needs_review" };
  return { batchId };
}

export default async function BatchReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { batchId } = await params;
  const { filter: filterParam, page: pageParam } = await searchParams;
  const filter: Filter =
    filterParam === "all" || filterParam === "needs_review" ? filterParam : "flagged";
  const page = parsePage(pageParam);

  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean().exec();
  if (!batch) notFound();

  // Only the current page of rows is fetched and sent to the client — a
  // large batch (thousands of rows) is no longer hydrated all at once.
  const query = filterToQuery(batchId, filter);
  const [rows, filteredTotal, approvedPending, unflaggedPending] = await Promise.all([
    ImportBatchRow.find(query)
      .sort({ rowNumber: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    ImportBatchRow.countDocuments(query),
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "approved", committedItemId: null }),
    ImportBatchRow.countDocuments({
      batchId,
      reviewStatus: "needs_review",
      "flags.0": { $exists: false },
    }),
  ]);

  return (
    <AppShell
      activeHref="/admin/import-review"
      backHref="/admin/import-review"
      backLabel="Legacy Import"
      eyebrow="Data migration"
      title={batch.sourceFileName}
    >
      <p className="text-ink-soft mb-6 text-[0.92rem]">
        {batch.totalRows} rows · {batch.flaggedRows} flagged for attention · status:{" "}
        <span className="capitalize">{batch.status.replace(/_/g, " ")}</span>
      </p>
      <ReviewTable
        batchId={String(batch._id)}
        rows={JSON.parse(JSON.stringify(rows))}
        filter={filter}
        page={page}
        filteredTotal={filteredTotal}
        approvedPendingCount={approvedPending}
        unflaggedPendingCount={unflaggedPending}
      />
    </AppShell>
  );
}
