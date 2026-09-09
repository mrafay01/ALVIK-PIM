import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves
import { checkMasterRecordComplete } from "@/lib/masterRecordComplete";
import { Card } from "@/components/ui/Card";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  await connectDB();

  const query = filter === "incomplete" ? { masterRecordComplete: false } : {};
  const items = await Item.find(query)
    .select("itemNumber vendorSku sampleSku category specs pricingHistory imageCompleteness masterRecordComplete vendorId status")
    .populate("vendorId", "name")
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  return (
    <AppShell activeHref="/catalog" eyebrow="Publish gate" title="Catalog">
      <p className="text-ink-soft max-w-[68ch] mb-3 text-[0.92rem]">
        An item can&apos;t be exported to a marketplace until its record is genuinely complete —
        recomputed automatically on every edit, not a manual checklist someone can forget.
      </p>

      <Card className="mb-5 flex items-center gap-3.5">
        <span className="flex items-center justify-center w-10 h-10 rounded-md bg-brass-bg text-brass shrink-0">
          <ShieldCheck size={20} />
        </span>
        <div>
          <div className="font-semibold text-[0.92rem] mb-1">Complete means all five hold true:</div>
          <div className="text-[0.82rem] text-ink-soft">
            Permanent item number · Category · Metal spec · At least one MSRP entry · All three image subfolders (main, sides, models)
          </div>
        </div>
      </Card>

      <div className="flex gap-1.5 mb-5">
        <a
          href="/catalog"
          className={`px-3.5 py-1.5 rounded-full text-[0.82rem] no-underline ${
            !filter ? "font-semibold bg-brass-bg text-brass" : "font-medium bg-transparent text-ink-soft"
          }`}
        >
          All
        </a>
        <a
          href="/catalog?filter=incomplete"
          className={`px-3.5 py-1.5 rounded-full text-[0.82rem] no-underline ${
            filter === "incomplete" ? "font-semibold bg-warn-bg text-warn" : "font-medium bg-transparent text-ink-soft"
          }`}
        >
          Incomplete only
        </a>
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No items match this filter.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["Item", "Vendor", "Complete", "Missing"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const checks = checkMasterRecordComplete(it);
                  const missing = checks.filter((c) => !c.ok);
                  return (
                    <tr key={String(it._id)} className="border-b border-border">
                      <td className={TD_CLASS}>
                        <a href={`/items/${it._id}`} className="font-mono font-semibold text-[0.85rem] text-navy-deep no-underline">
                          {it.itemNumber || it.sampleSku || it.vendorSku}
                        </a>
                      </td>
                      <td className={TD_CLASS}>{(it.vendorId as unknown as { name?: string } | null)?.name || "—"}</td>
                      <td className={TD_CLASS}>
                        {it.masterRecordComplete ? (
                          <span className="flex items-center gap-1.5 text-good text-[0.83rem] font-semibold">
                            <CheckCircle2 size={14} /> Complete
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-ink-faint text-[0.83rem]">
                            <XCircle size={14} /> Incomplete
                          </span>
                        )}
                      </td>
                      <td className={`${TD_CLASS} text-warn`}>
                        {missing.length === 0 ? "—" : missing.map((m) => m.reason).join("; ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
