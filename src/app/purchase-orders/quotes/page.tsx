import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Quotation from "@/models/Quotation";
import Vendor from "@/models/Vendor";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { FilePlus2, Upload } from "lucide-react";

const STATUS_TONE: Record<string, "good" | "warn" | "brass" | "neutral"> = {
  parsing: "neutral",
  needs_review: "warn",
  reviewed: "brass",
  committed: "good",
};

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function QuotesListPage() {
  await connectDB();
  void Vendor; // ensure the model is registered for populate

  const quotations = await Quotation.find({})
    .select("source sourceFileName poNumber vendorId status totalRows flaggedRows approvedRows createdAt")
    .populate("vendorId", "name")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return (
    <AppShell
      activeHref="/purchase-orders"
      backHref="/purchase-orders"
      backLabel="Purchase Orders"
      eyebrow="Vendor pipeline"
      title="Quotes"
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Every vendor quote intaken here, as an uploaded file or entered by hand. Parsed line
        items are staged for review; nothing becomes an item until you approve and commit it.
      </p>

      <div className="flex gap-2.5 mb-7 flex-wrap">
        <Link
          href="/purchase-orders/quotes/new"
          className="flex items-center gap-1.5 font-body font-semibold text-[0.87rem] px-4 py-2.5 rounded-sm bg-brass text-on-brass border border-brass shadow-[0_2px_10px_var(--brass-glow)] no-underline hover:bg-brass-hover"
        >
          <FilePlus2 size={15} /> New quote manually
        </Link>
        <Link
          href="/purchase-orders/quotes/import"
          className="flex items-center gap-1.5 font-body font-semibold text-[0.87rem] px-4 py-2.5 rounded-sm bg-surface text-ink border border-border-strong no-underline hover:border-brass hover:text-brass"
        >
          <Upload size={15} /> Import quote file
        </Link>
      </div>

      {quotations.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No quotes yet.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["Quote", "Vendor", "Source", "Status", "Items", "Flagged", "Created"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => (
                  <tr key={String(q._id)} className="czc-row border-b border-border">
                    <td className={TD_CLASS}>
                      <Link
                        href={`/purchase-orders/quotes/${q._id}`}
                        className="font-semibold text-navy-deep no-underline"
                      >
                        {q.sourceFileName || q.poNumber || `Quote ${String(q._id).slice(-6)}`}
                      </Link>
                    </td>
                    <td className={TD_CLASS}>
                      {(q.vendorId as unknown as { name?: string } | null)?.name || "—"}
                    </td>
                    <td className={`${TD_CLASS} text-ink-soft capitalize`}>
                      {q.source === "file_upload" ? "file" : "manual"}
                    </td>
                    <td className={TD_CLASS}>
                      <Pill tone={STATUS_TONE[q.status] ?? "neutral"}>{q.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className={`${TD_CLASS} font-mono`}>{q.totalRows}</td>
                    <td className={`${TD_CLASS} font-mono ${q.flaggedRows > 0 ? "text-warn" : "text-ink-soft"}`}>
                      {q.flaggedRows}
                    </td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {q.createdAt ? new Date(q.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
