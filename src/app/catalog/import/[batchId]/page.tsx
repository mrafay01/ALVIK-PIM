import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { ReviewTable } from "./ReviewTable";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { isObjectId } from "@/lib/ids";
import { onReviewPage, searchFilter } from "@/lib/import/reviewQuery";
import { masterFileFieldLabel } from "@/lib/import/parseMasterFile";

// Review step of a Master File import. Rows waiting here are either
// committed to the catalog or sent to Flagged Items to be fixed later;
// fixing happens on Flagged Items, so this page stays a quick triage.
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
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = parsePage(sp.page);

  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean().exec();
  if (!batch) notFound();

  const waiting = { ...onReviewPage(batchId), ...searchFilter(q) };
  const [rows, total, flagged, parked] = await Promise.all([
    ImportBatchRow.find(waiting)
      .select("rowNumber coerced flags")
      .sort({ rowNumber: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    ImportBatchRow.countDocuments(waiting),
    ImportBatchRow.countDocuments({ ...waiting, "flags.0": { $exists: true } }),
    ImportBatchRow.countDocuments({ batchId, parkedAt: { $ne: null }, committedItemId: null, reviewStatus: { $ne: "rejected" } }),
  ]);
  // A file with nothing left to review has no page of its own any more;
  // Recent imports keeps just its name and counts.
  if (total === 0 && !q) redirect("/catalog/import?done=1");

  const shaped = rows.map((r) => ({
    _id: String(r._id),
    rowNumber: r.rowNumber,
    coerced: r.coerced as Record<string, unknown>,
    issues: (r.flags ?? []).map((f) => ({ label: masterFileFieldLabel(f.field), message: f.message })),
  }));

  return (
    <AppShell
      activeHref="/catalog"
      backHref="/catalog/import"
      backLabel="Import Master File"
      eyebrow="Master File import"
      title={batch.sourceFileName}
    >
      <ReviewTable
        batchId={String(batch._id)}
        rows={shaped}
        q={q}
        page={page}
        counts={{ total, flagged, unflagged: total - flagged, parked, committed: batch.approvedRows, fileRows: batch.totalRows }}
      />
    </AppShell>
  );
}
