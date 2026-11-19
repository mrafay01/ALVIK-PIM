import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Vendor from "@/models/Vendor";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { QuoteReviewTable } from "./QuoteReviewTable";
import { QuoteHeaderActions } from "./QuoteHeaderActions";
import PurchaseOrder from "@/models/PurchaseOrder";
import { isObjectId } from "@/lib/ids";
import { getSessionRole } from "@/lib/authz";
import { isReadOnlyRole } from "@/lib/enums";

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
    filterParam === "flagged" || filterParam === "needs_review" ? filterParam : "all";
  const page = parsePage(pageParam);

  if (!isObjectId(quotationId)) notFound();
  await connectDB();
  void Vendor;
  const quotation = await Quotation.findById(quotationId).populate("vendorId", "name").lean();
  if (!quotation) notFound();

  const query = filterToQuery(quotationId, filter);
  const [rows, filteredTotal, approvedPending, unflaggedPending, grandTotal, committedCount, linkedPo] = await Promise.all([
    QuotationRow.find(query).select("-raw").sort({ rowNumber: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    QuotationRow.countDocuments(query),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "approved", committedItemId: null }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "needs_review", "flags.0": { $exists: false } }),
    QuotationRow.countDocuments({ quotationId }),
    QuotationRow.countDocuments({ quotationId, committedItemId: { $ne: null } }),
    quotation.purchaseOrderId
      ? PurchaseOrder.findById(quotation.purchaseOrderId).select("poNumber").lean()
      : Promise.resolve(null),
  ]);

  const readOnly = isReadOnlyRole(await getSessionRole());
  const vendorName = (quotation.vendorId as unknown as { name?: string } | null)?.name ?? "—";
  const title = quotation.sourceFileName || quotation.poNumber || `Quote ${quotationId.slice(-6)}`;

  return (
    <AppShell
      activeHref="/purchase-orders/quotes"
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
      <QuoteHeaderActions
        quotationId={quotationId}
        purchaseOrderId={linkedPo ? String(linkedPo._id) : null}
        poNumber={linkedPo?.poNumber ?? null}
        canDelete={committedCount === 0 && !readOnly}
        fileUrl={quotation.sourceFile?.webUrl ?? null}
        fileName={quotation.sourceFile?.name ?? null}
      />
      <QuoteReviewTable
        quotationId={quotationId}
        rows={JSON.parse(JSON.stringify(rows))}
        customColumns={(quotation.customColumns ?? []) as string[]}
        filter={filter}
        page={page}
        filteredTotal={filteredTotal}
        approvedPendingCount={approvedPending}
        unflaggedPendingCount={unflaggedPending}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
