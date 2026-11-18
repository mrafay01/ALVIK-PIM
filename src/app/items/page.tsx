import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import "@/models/Vendor";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { PackageSearch, FileSpreadsheet, Keyboard } from "lucide-react";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/statusDisplay";
import { MONDAY_LABEL_TO_STATUS } from "@/lib/monday/config";
import type { PoStatus } from "@/lib/enums";

// Un-Verified Items — items that came in via a PO (manual quote upload
// or Monday pull at "In Production" or later) and have not yet been
// promoted into the catalog. Per the client's rule 2026-10-12, this is
// the only intake path for the Items page; Master File imports and
// hand-added catalog entries skip this page entirely because they're
// already verified.

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

type Filter = "all" | "manual" | "monday";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manual", label: "Manual entry" },
  { value: "monday", label: "From Monday" },
];

export default async function UnverifiedItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter: Filter =
    sp.filter === "manual" || sp.filter === "monday" ? sp.filter : "all";
  const page = parsePage(sp.page);

  await connectDB();

  // Only items that:
  //   - came in via a PO (intakeSource is set — Master-File / manual-
  //     catalog origins never set this), AND
  //   - have NOT been promoted into the catalog yet (inCatalog false
  //     or missing — once an item is verified into the catalog, it's
  //     off this page and visible on /catalog instead).
  // Spelled as $in / $ne:true (rather than $ne:null / $or) so the
  // { intakeSource, createdAt } index serves both the filter and the sort.
  const baseMatch = {
    intakeSource: { $in: ["manual_quote", "monday_pull"] },
    inCatalog: { $ne: true },
  };
  const match: Record<string, unknown> = { ...baseMatch };
  if (filter === "manual") match.intakeSource = "manual_quote";
  if (filter === "monday") match.intakeSource = "monday_pull";

  const [items, total, counts] = await Promise.all([
    Item.find(match)
      .select(
        "itemNumber sampleSku vendorId vendorSku title category status intakeSource sourcePoNumber sourceMondayStatus updatedAt createdAt"
      )
      .populate("vendorId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Item.countDocuments(match),
    Item.aggregate<{ _id: string; count: number }>([
      { $match: baseMatch },
      { $group: { _id: "$intakeSource", count: { $sum: 1 } } },
    ]),
  ]);

  const countBySource = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const manualCount = countBySource.manual_quote ?? 0;
  const mondayCount = countBySource.monday_pull ?? 0;

  return (
    <AppShell activeHref="/items" eyebrow="Pre-catalog pipeline" title="Un-Verified Items">
      <p className="text-ink-soft max-w-[72ch] mb-5 text-[0.92rem]">
        New items waiting to be checked and added to the catalog.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <StatTile icon={PackageSearch} label="Total un-verified" value={total} tone="brand" />
        <StatTile icon={Keyboard} label="From manual entry" value={manualCount} tone="neutral" />
        <StatTile icon={FileSpreadsheet} label="From Monday" value={mondayCount} tone="neutral" />
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = filter === t.value;
          const href = t.value === "all" ? "/items" : `/items?filter=${t.value}`;
          return (
            <a
              key={t.value}
              href={href}
              className={`px-3.5 py-1.5 rounded-full text-[0.82rem] no-underline ${
                active ? "font-semibold bg-brand-bg text-brand" : "font-medium bg-transparent text-ink-soft"
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </div>

      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            No un-verified items{filter !== "all" ? " on this filter" : ""}.
          </p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  {["Item #", "Vendor SKU", "Vendor", "Title", "From PO", "Status", "Added via", "Created"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const vendorName = (it.vendorId as unknown as { name?: string } | null)?.name ?? "—";
                  // For Monday-pulled rows the Monday status label is
                  // what tells the reviewer where this item is in the
                  // vendor pipeline right now; for manual-quote rows
                  // the item's own lifecycle status is more useful.
                  const mondayStatus = it.sourceMondayStatus ?? null;
                  const mondayMapped: PoStatus | null = mondayStatus
                    ? MONDAY_LABEL_TO_STATUS[mondayStatus] ?? null
                    : null;
                  return (
                    <tr key={String(it._id)} className="czc-row border-b border-border">
                      <td className={TD_CLASS}>
                        <Link
                          href={`/items/${it._id}`}
                          className="font-mono font-semibold text-[0.84rem] text-navy-deep no-underline"
                        >
                          {it.itemNumber ?? it.sampleSku ?? "—"}
                        </Link>
                      </td>
                      <td className={`${TD_CLASS} font-mono text-[0.82rem]`}>{it.vendorSku ?? "—"}</td>
                      <td className={`${TD_CLASS} text-ink-soft`}>{vendorName}</td>
                      <td className={`${TD_CLASS} text-ink-soft truncate max-w-[280px]`} title={it.title ?? undefined}>
                        {it.title ?? "—"}
                      </td>
                      <td className={`${TD_CLASS} font-mono text-[0.82rem]`}>{it.sourcePoNumber ?? "—"}</td>
                      <td className={TD_CLASS}>
                        {it.intakeSource === "monday_pull" && mondayStatus ? (
                          <Pill tone={mondayMapped ? PO_STATUS_TONE[mondayMapped] : "neutral"}>
                            {mondayMapped ? PO_STATUS_LABEL[mondayMapped] : mondayStatus}
                          </Pill>
                        ) : (
                          <Pill tone={ITEM_STATUS_TONE[it.status as keyof typeof ITEM_STATUS_TONE]}>
                            {ITEM_STATUS_LABEL[it.status as keyof typeof ITEM_STATUS_LABEL]}
                          </Pill>
                        )}
                      </td>
                      <td className={TD_CLASS}>
                        {it.intakeSource === "manual_quote" ? (
                          <span className="inline-flex items-center gap-1 text-[0.8rem] text-ink-soft">
                            <Keyboard size={11} /> Manual
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[0.8rem] text-ink-soft">
                            <FileSpreadsheet size={11} /> Monday
                          </span>
                        )}
                      </td>
                      <td className={`${TD_CLASS} text-[0.78rem] text-ink-faint`}>
                        {it.createdAt ? new Date(it.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination
              page={page}
              total={total}
              basePath="/items"
              query={{ filter: filter === "all" ? undefined : filter }}
            />
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof PackageSearch;
  label: string;
  value: number;
  tone: "brand" | "neutral";
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-bg text-brand border-[color:var(--brand-glow)]"
      : "bg-surface-sunken text-ink-soft border-border";
  return (
    <Card className="flex items-center gap-3.5">
      <span className={`flex items-center justify-center w-10 h-10 rounded-md border shrink-0 ${toneClass}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="font-mono text-[1.3rem] font-semibold text-ink leading-tight">{value}</div>
      </div>
    </Card>
  );
}
