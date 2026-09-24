import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole } from "@/lib/authz";
import type { PipelineStage } from "mongoose";
import Item from "@/models/Item";
import { checkMasterRecordComplete } from "@/lib/masterRecordComplete";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { ShieldCheck, Plus } from "lucide-react";
import { CatalogRowFlags } from "./CatalogRowFlags";
import { CatalogFilters } from "./CatalogFilters";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-3.5 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-3.5 py-3 text-[0.84rem]";

type Tab = "all" | "incomplete" | "pending" | "variations" | "inactive";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete only" },
  { value: "pending", label: "Pending approval" },
  { value: "variations", label: "Show only variations" },
  { value: "inactive", label: "Inactive only" },
];

// Escape a user string for safe use inside a MongoDB $regex.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${n.toLocaleString()}`;
}

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmtEditedDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const SORT_STAGES: Record<string, Record<string, 1 | -1>> = {
  sku: { itemNumber: 1 },
  sku_desc: { itemNumber: -1 },
  title: { title: 1, itemNumber: 1 },
  msrp_asc: { latestMsrp: 1, itemNumber: 1 },
  msrp_desc: { latestMsrp: -1, itemNumber: 1 },
  newest: { updatedAt: -1 },
};

type SearchParams = {
  filter?: string;
  page?: string;
  q?: string;
  category?: string;
  plating?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tab: Tab =
    sp.filter === "incomplete" ||
    sp.filter === "pending" ||
    sp.filter === "variations" ||
    sp.filter === "inactive"
      ? sp.filter
      : "all";
  const page = parsePage(sp.page);
  const q = (sp.q ?? "").trim();
  const category = (sp.category ?? "").trim();
  const plating = (sp.plating ?? "").trim();
  const minPrice = num(sp.minPrice);
  const maxPrice = num(sp.maxPrice);
  const sort = sp.sort && sp.sort in SORT_STAGES ? sp.sort : "sku";

  await connectDB();
  const role = await getSessionRole();
  const canApprove = role === "administrator";

  // A SKU having a hyphen doesn't make it a variation — e.g. A80219-ROSE
  // may be the only row with that base SKU, in which case the hyphen is
  // just encoding its plating, not marking a sibling relationship. A row
  // is a real variation only when another catalog item shares its baseSku,
  // so that has to be counted across the whole catalog before the page's
  // own filters/pagination are applied.
  const baseSkuCounts = await Item.aggregate([
    { $match: { inCatalog: true } },
    { $group: { _id: "$baseSku", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  const familySkus = (baseSkuCounts as { _id: string }[]).map((r) => r._id);

  // Base match — the tab filter + always inCatalog.
  const match: Record<string, unknown> = { inCatalog: true };
  if (tab === "incomplete") match.masterRecordComplete = false;
  if (tab === "pending") match["catalogApproval.status"] = "pending";
  if (tab === "variations") match.baseSku = { $in: familySkus };
  if (tab === "inactive") match.active = false;
  if (category) match.category = category;
  if (plating) match["specs.plating"] = plating;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    match.$or = [{ itemNumber: rx }, { title: rx }, { brand: rx }, { upc: rx }];
  }

  // latestMsrp is the last pricingHistory entry's msrp; price filter + sort
  // need it as a real field, so compute it in the pipeline.
  const priceMatch: Record<string, unknown> = {};
  if (minPrice != null) priceMatch.$gte = minPrice;
  if (maxPrice != null) priceMatch.$lte = maxPrice;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        latestMsrp: { $ifNull: [{ $last: "$pricingHistory.msrp" }, null] },
      },
    },
  ];
  if (Object.keys(priceMatch).length > 0) {
    pipeline.push({ $match: { latestMsrp: priceMatch } });
  }
  pipeline.push({
    $facet: {
      rows: [
        { $sort: SORT_STAGES[sort] },
        { $skip: (page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE },
        // Only resolves the editor's name for the one page of rows being
        // rendered, not the whole matched set — cheap even on a large
        // catalog since $lookup runs after $skip/$limit here.
        {
          $lookup: {
            from: "users",
            localField: "lastEditedBy",
            foreignField: "_id",
            as: "lastEditedByUser",
          },
        },
        {
          $addFields: {
            lastEditedByName: { $arrayElemAt: ["$lastEditedByUser.name", 0] },
          },
        },
        {
          $project: {
            itemNumber: 1,
            baseSku: 1,
            variantSuffix: 1,
            title: 1,
            category: 1,
            brand: 1,
            upc: 1,
            "specs.plating": 1,
            "specs.metal": 1,
            pricingHistory: 1,
            imageCompleteness: 1,
            masterRecordComplete: 1,
            catalogApproval: 1,
            latestMsrp: 1,
            active: 1,
            updatedAt: 1,
            lastEditedByName: 1,
          },
        },
      ],
      count: [{ $count: "n" }],
    },
  });

  const [facetResult, categories, platings] = await Promise.all([
    Item.aggregate(pipeline).collation({ locale: "en", numericOrdering: true }),
    Item.distinct("category", { inCatalog: true }),
    Item.distinct("specs.plating", { inCatalog: true }),
  ]);
  const familySkuSet = new Set(familySkus);

  const items = (facetResult[0]?.rows ?? []) as Array<{
    _id: unknown;
    itemNumber?: string;
    baseSku?: string;
    variantSuffix?: string | null;
    title?: string;
    category?: string;
    brand?: string;
    upc?: string;
    specs?: { plating?: string; metal?: string };
    pricingHistory?: { msrp?: number }[];
    imageCompleteness?: { main?: boolean; sides?: boolean; models?: boolean };
    masterRecordComplete?: boolean;
    catalogApproval?: { status?: string };
    latestMsrp?: number | null;
    active?: boolean;
    updatedAt?: string | Date;
    lastEditedByName?: string;
  }>;
  const total: number = facetResult[0]?.count?.[0]?.n ?? 0;

  const filterState = {
    q,
    category,
    plating,
    minPrice: sp.minPrice ?? "",
    maxPrice: sp.maxPrice ?? "",
    sort,
    tab,
  };
  const carryQuery = {
    filter: tab === "all" ? undefined : tab,
    q: q || undefined,
    category: category || undefined,
    plating: plating || undefined,
    minPrice: sp.minPrice || undefined,
    maxPrice: sp.maxPrice || undefined,
    sort: sort === "sku" ? undefined : sort,
  };

  return (
    <AppShell activeHref="/catalog" eyebrow="Finalized database" title="Catalog">
      <p className="text-ink-soft max-w-[68ch] mb-3 text-[0.92rem]">
        The company&apos;s verified product database — Master File items, hand-added items, and
        quote items an admin has approved. Vendor-quote items in the pipeline don&apos;t appear here.
        Click a SKU for the full item.
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <Card className="flex items-center gap-3.5 flex-1 min-w-[320px]">
          <span className="flex items-center justify-center w-10 h-10 rounded-md bg-brass-bg text-brass shrink-0">
            <ShieldCheck size={20} />
          </span>
          <div>
            <div className="font-semibold text-[0.92rem] mb-1">Complete means all five hold true:</div>
            <div className="text-[0.82rem] text-ink-soft">
              Permanent item number · Category · Metal spec · At least one MSRP entry · All three image
              subfolders (main, sides, models)
            </div>
          </div>
        </Card>
        <Link
          href="/catalog/new"
          className="flex items-center gap-1.5 font-body font-semibold text-[0.87rem] px-4 py-2.5 rounded-sm bg-brass text-on-brass border border-brass shadow-[0_2px_10px_var(--brass-glow)] no-underline hover:bg-brass-hover"
        >
          <Plus size={15} /> New catalog item
        </Link>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.value;
          const params = new URLSearchParams();
          if (t.value !== "all") params.set("filter", t.value);
          if (q) params.set("q", q);
          if (category) params.set("category", category);
          if (plating) params.set("plating", plating);
          if (sp.minPrice) params.set("minPrice", sp.minPrice);
          if (sp.maxPrice) params.set("maxPrice", sp.maxPrice);
          if (sort !== "sku") params.set("sort", sort);
          const qs = params.toString();
          return (
            <a
              key={t.value}
              href={qs ? `/catalog?${qs}` : "/catalog"}
              className={`px-3.5 py-1.5 rounded-full text-[0.82rem] no-underline ${
                active
                  ? t.value === "incomplete"
                    ? "font-semibold bg-warn-bg text-warn"
                    : "font-semibold bg-brass-bg text-brass"
                  : "font-medium bg-transparent text-ink-soft"
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </div>

      <CatalogFilters
        state={filterState}
        categories={(categories as string[]).filter(Boolean).sort()}
        platings={(platings as string[]).filter(Boolean).sort()}
      />

      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No items match these filters.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[16%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr>
                {["SKU", "Title", "Category", "Brand", "Plating", "UPC", "MSRP", "Status", "Last edited", "Variation?", ""].map(
                  (h, i) => (
                    <th key={i} className={i === 6 ? `${TH_CLASS} text-right` : TH_CLASS}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const missing = checkMasterRecordComplete(
                  it as unknown as Parameters<typeof checkMasterRecordComplete>[0]
                )
                  .filter((c) => !c.ok)
                  .map((c) => c.reason ?? c.field);
                const isVariant = !!it.baseSku && familySkuSet.has(it.baseSku);
                const pending = it.catalogApproval?.status === "pending";
                return (
                  <tr key={String(it._id)} className="czc-row border-b border-border">
                    <td className={`${TD_CLASS} truncate`}>
                      <a
                        href={`/items/${it._id}`}
                        className="font-mono font-semibold text-[0.83rem] text-navy-deep no-underline"
                      >
                        {it.itemNumber}
                      </a>
                    </td>
                    <td className={`${TD_CLASS} text-ink truncate`} title={it.title || undefined}>
                      {it.title || "—"}
                    </td>
                    <td className={`${TD_CLASS} text-ink-soft truncate`}>{it.category || "—"}</td>
                    <td className={`${TD_CLASS} text-ink-soft truncate`}>{it.brand || "—"}</td>
                    <td
                      className={`${TD_CLASS} text-ink-soft truncate`}
                      title={it.specs?.plating || undefined}
                    >
                      {it.specs?.plating || "—"}
                    </td>
                    <td className={`${TD_CLASS} font-mono text-[0.8rem] truncate`}>{it.upc || "—"}</td>
                    <td className={`${TD_CLASS} font-mono text-right`}>{money(it.latestMsrp)}</td>
                    <td className={TD_CLASS}>
                      <Pill tone={it.active === false ? "neutral" : "good"} dot>
                        {it.active === false ? "Inactive" : "Active"}
                      </Pill>
                    </td>
                    <td className={`${TD_CLASS} text-ink-soft`}>
                      <span className="block truncate" title={fmtEditedDate(it.updatedAt)}>
                        {fmtEditedDate(it.updatedAt)}
                      </span>
                      <span className="block text-[0.76rem] text-ink-faint truncate">
                        {it.lastEditedByName || "—"}
                      </span>
                    </td>
                    <td className={`${TD_CLASS} text-ink-soft`}>
                      {isVariant ? (
                        <span className="text-[0.82rem]">
                          Yes
                          {it.variantSuffix && <span className="text-ink-faint"> · {it.variantSuffix}</span>}
                        </span>
                      ) : (
                        <span className="text-ink-faint text-[0.82rem]">No</span>
                      )}
                    </td>
                    <td className={`${TD_CLASS} !py-2`}>
                      <CatalogRowFlags
                        itemId={String(it._id)}
                        missing={missing}
                        pending={pending}
                        canApprove={canApprove}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 pb-3">
            <Pagination page={page} total={total} basePath="/catalog" query={carryQuery} />
          </div>
        </Card>
      )}
    </AppShell>
  );
}
