import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { ReviewTable } from "./ReviewTable";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { isObjectId } from "@/lib/ids";
import { parseReviewParams, reviewQuery, REVIEW_SORTS } from "@/lib/import/reviewQuery";

export default async function BatchReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { batchId } = await params;
  if (!isObjectId(batchId)) notFound();
  if ((await getSessionRole()) !== "administrator") redirect("/unauthorized");
  const sp = await searchParams;
  const reviewParams = parseReviewParams(sp);
  const page = parsePage(sp.page);

  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean().exec();
  if (!batch) notFound();

  // Only the current page of rows is fetched and sent to the client — a
  // large batch (thousands of rows) is never hydrated all at once.
  const query = reviewQuery(batchId, reviewParams);
  const [rows, filteredTotal, approvedPending, unflaggedPending, categories, brands] = await Promise.all([
    ImportBatchRow.find(query)
      .select("rowNumber coerced flags reviewStatus committedItemId")
      .sort(REVIEW_SORTS[reviewParams.sort].sort)
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
    ImportBatchRow.distinct("coerced.category", { batchId }),
    ImportBatchRow.distinct("coerced.brand", { batchId }),
  ]);

  const clean = (vals: unknown[]) =>
    (vals.filter((v) => typeof v === "string" && v.trim()) as string[]).sort((a, b) => a.localeCompare(b));

  return (
    <AppShell
      activeHref="/catalog"
      backHref="/catalog/import"
      backLabel="Import Master File"
      eyebrow="Master File import"
      title={batch.sourceFileName}
    >
      <p className="text-ink-soft mb-6 text-[0.92rem]">
        {batch.totalRows} rows · {batch.flaggedRows} flagged for attention · {batch.approvedRows} approved ·{" "}
        {batch.rejectedRows} excluded · status: <span className="capitalize">{batch.status.replace(/_/g, " ")}</span>
      </p>
      <ReviewTable
        batchId={String(batch._id)}
        rows={JSON.parse(JSON.stringify(rows))}
        params={reviewParams}
        page={page}
        filteredTotal={filteredTotal}
        approvedPendingCount={approvedPending}
        unflaggedPendingCount={unflaggedPending}
        categories={clean(categories)}
        brands={clean(brands)}
      />
    </AppShell>
  );
}
