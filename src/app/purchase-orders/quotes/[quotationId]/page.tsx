import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Vendor from "@/models/Vendor";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { QuoteReviewTable } from "./QuoteReviewTable";

type Filter = "all" | "flagged" | "needs_review";

function filterToQuery(quotationId: string, filter: Filter): Record<string, unknown> {
  if (filter === "flagged") return { quotationId, "flags.0": { $exists: true } };
  if (filter === "needs_review") return { quotationId, reviewStatus: "needs_review" };
  return { quotationId };
}

export default async function QuoteReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ quotationId: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { quotationId } = await params;
  const { filter: filterParam, page: pageParam } = await searchParams;
  const filter: Filter =
    filterParam === "all" || filterParam === "needs_review" ? filterParam : "flagged";
  const page = parsePage(pageParam);

  await connectDB();
  void Vendor;
  const quotation = await Quotation.findById(quotationId).populate("vendorId", "name").lean();
  if (!quotation) notFound();

  const query = filterToQuery(quotationId, filter);
  const [rows, filteredTotal, approvedPending, unflaggedPending, grandTotal] = await Promise.all([
    QuotationRow.find(query).sort({ rowNumber: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    QuotationRow.countDocuments(query),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "approved", committedItemId: null }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "needs_review", "flags.0": { $exists: false } }),
    QuotationRow.countDocuments({ quotationId }),
  ]);

  const vendorName = (quotation.vendorId as unknown as { name?: string } | null)?.name ?? "—";
  const title = quotation.sourceFileName || quotation.poNumber || `Quote ${quotationId.slice(-6)}`;

  return (
    <AppShell
      activeHref="/purchase-orders"
      backHref="/purchase-orders/quotes"
      backLabel="Quotes"
      eyebrow={`Quote review · ${vendorName}`}
      title={title}
    >
      <p className="text-ink-soft mb-6 text-[0.92rem]">
        {grandTotal} line item{grandTotal === 1 ? "" : "s"} · {quotation.flaggedRows} flagged ·{" "}
        {quotation.approvedRows} approved · status:{" "}
        <span className="capitalize">{quotation.status.replace(/_/g, " ")}</span>
      </p>
      <QuoteReviewTable
        quotationId={quotationId}
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
