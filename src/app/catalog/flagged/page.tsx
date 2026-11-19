import { hasFullAccess } from "@/lib/enums";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import ImportBatchRow from "@/models/ImportBatchRow";
import "@/models/ImportBatch";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { ON_FLAGGED_PAGE, searchFilter } from "@/lib/import/reviewQuery";
import { masterFileFieldLabel, masterFileFieldKind } from "@/lib/import/parseMasterFile";
import { FlaggedTable, type FlaggedRow, type IssueOption } from "./FlaggedTable";
import { existingItemsBySku } from "@/lib/import/existingSkus";

// "Non-numeric value "abc"" -> "Non-numeric value": the issue without the
// specific bad value, so rows with the same problem group together.
function issueSummary(message: string): string {
  return message
    .replace(/\s*"[^"]*"/g, "")
    .replace(/;.*$/, "")
    .trim();
}

// Flagged Items: Master File rows sent here from an import's review page
// to be fixed. Filter by issue, fix one row at a time or give every row
// with the same issue one value, then commit the fixed rows to the catalog.
export default async function FlaggedItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!hasFullAccess(await getSessionRole())) redirect("/unauthorized");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const issue = (sp.issue ?? "").trim().slice(0, 100);
  const page = parsePage(sp.page);

  await connectDB();
  const base = { ...ON_FLAGGED_PAGE, ...searchFilter(q) };
  const match =
    issue === "__fixed" ? { ...base, "flags.0": { $exists: false } } : issue ? { ...base, "flags.field": issue } : base;

  const [rows, total, allCount, fixedCount, issueGroups] = await Promise.all([
    ImportBatchRow.find(match)
      .select("batchId rowNumber coerced flags")
      .populate("batchId", "sourceFileName")
      .sort({ parkedAt: 1, rowNumber: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    ImportBatchRow.countDocuments(match),
    ImportBatchRow.countDocuments(base),
    ImportBatchRow.countDocuments({ ...base, "flags.0": { $exists: false } }),
    ImportBatchRow.aggregate<{ _id: string; rows: number; sample: string }>([
      { $match: base },
      { $unwind: "$flags" },
      { $group: { _id: { row: "$_id", field: "$flags.field" }, sample: { $first: "$flags.message" } } },
      { $group: { _id: "$_id.field", rows: { $sum: 1 }, sample: { $first: "$sample" } } },
      { $sort: { rows: -1 } },
    ]),
  ]);

  // A page past the end (rows committed or fixed since): the last page.
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage && total > 0) {
    const sp2 = new URLSearchParams();
    if (q) sp2.set("q", q);
    if (issue) sp2.set("issue", issue);
    if (lastPage > 1) sp2.set("page", String(lastPage));
    redirect(`/catalog/flagged${sp2.size ? `?${sp2}` : ""}`);
  }

  const issues: IssueOption[] = issueGroups.map((g) => ({
    field: g._id,
    label: masterFileFieldLabel(g._id),
    summary: issueSummary(g.sample),
    rows: g.rows,
    kind: masterFileFieldKind(g._id),
  }));

  const existing = await existingItemsBySku(rows.map((r) => (r.coerced as Record<string, unknown>)?.itemNumber));
  const shaped: FlaggedRow[] = rows.map((r) => {
    const batch = r.batchId as unknown as { _id: unknown; sourceFileName?: string } | null;
    const sku = (r.coerced as Record<string, unknown>)?.itemNumber;
    return {
      updates: typeof sku === "string" ? existing.get(sku.toLowerCase()) ?? null : null,
      _id: String(r._id),
      batchId: String(batch?._id ?? r.batchId),
      fileName: batch?.sourceFileName ?? "—",
      rowNumber: r.rowNumber,
      coerced: r.coerced as Record<string, unknown>,
      flags: (r.flags ?? []).map((f) => ({
        field: f.field,
        label: masterFileFieldLabel(f.field),
        message: f.message,
        rawValue: f.rawValue === undefined || f.rawValue === null ? "" : String(f.rawValue),
      })),
    };
  });

  return (
    <AppShell activeHref="/catalog/flagged" backHref="/catalog" backLabel="Catalog" eyebrow="Catalog" title="Flagged Items">
      <p className="text-ink-soft max-w-[72ch] mb-5 text-[0.92rem]">
        Imported rows that need fixing before they join the catalog.
      </p>
      <FlaggedTable
        rows={shaped}
        page={page}
        q={q}
        issue={issue}
        issues={issues}
        counts={{ total, all: allCount, fixed: fixedCount }}
      />
    </AppShell>
  );
}
