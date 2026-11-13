import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import type { PipelineStage } from "mongoose";
import Item from "@/models/Item";
import CatalogConflict from "@/models/CatalogConflict";
import ImportBatch from "@/models/ImportBatch";
import { checkMasterRecordComplete } from "@/lib/masterRecordComplete";
import { loadCatalogFacets } from "@/lib/catalog/facets";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { StatCard } from "@/components/ui/StatCard";
import { ShieldCheck, TriangleAlert, ListChecks, BookOpenCheck, CircleCheck, CircleDashed, Hourglass } from "lucide-react";
import { CatalogRowFlags } from "./CatalogRowFlags";
import { CatalogFilters } from "./CatalogFilters";
import { CatalogSelectionProvider, CatalogExportBar, RowSelect, PageSelect } from "./CatalogSelection";
import { parseCatalogQuery, catalogMatch, catalogPriceMatch, LATEST_MSRP, type CatalogTab } from "@/lib/catalog/listQuery";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-3.5 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-3.5 py-3 text-[0.84rem]";

const TABS: { value: CatalogTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete only" },
  { value: "pending", label: "Pending approval" },
  { value: "variations", label: "Show only variations" },
  { value: "inactive", label: "Inactive only" },
];

function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${n.toLocaleString()}`;
}

function fmtEditedDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const SORT_STAGES: Record<string, Record<string, 1 | -1>> = {
  sku: { itemNumber: 1 },
  sku_desc: { itemNumber: -1 },
  title: { title: 1, itemNumber: 1 },
  brand: { brand: 1, itemNumber: 1 },
  msrp_asc: { latestMsrp: 1, itemNumber: 1 },
  msrp_desc: { latestMsrp: -1, itemNumber: 1 },
  newest: { updatedAt: -1 },
};

type SearchParams = {
  filter?: string;
  page?: string;
  q?: string;
  category?: string;
  brand?: string;
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
  const listQuery = parseCatalogQuery(sp);
  const { tab, q, category, brand, plating } = listQuery;
  const page = parsePage(sp.page);
  const sort = sp.sort && sp.sort in SORT_STAGES ? sp.sort : "sku";

  await connectDB();

  // A SKU having a hyphen doesn't make it a variation — e.g. A80219-ROSE
  // may be the only row with that base SKU, in which case the hyphen is
  // just encoding its plating, not marking a sibling relationship. A row
  // is a real variation only when another catalog item shares its baseSku,
  // so that has to be counted across the whole catalog (cached, together
  // with the filter dropdown values — see lib/catalog/facets.ts).
  const { counts, familySkus, categories, brands, platings } = await loadCatalogFacets();

  // Base match — the tab filter + always inCatalog (shared with the export).
  const match = catalogMatch(listQuery, familySkus);

  // latestMsrp is the last pricingHistory entry's msrp; price filter + sort
  // need it as a real field, so compute it in the pipeline.
  const priceMatch = catalogPriceMatch(listQuery);

  const pipeline: PipelineStage[] = [
    { $match: match },
    // Trim each document to what the list renders *before* the sort: the
    // sort runs over every matched row, and full item documents (media,
    // descriptions, cost history) would make that sort many times heavier
    // and can hit the server's in-memory sort limit on a large catalog.
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
        "pricingHistory.msrp": 1,
        imageCompleteness: 1,
        masterRecordComplete: 1,
        "catalogApproval.status": 1,
        active: 1,
        updatedAt: 1,
        lastEditedBy: 1,
        conflictCount: 1,
        latestMsrp: LATEST_MSRP,
      },
    },
  ];
  if (priceMatch) pipeline.push({ $match: priceMatch });
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
            pipeline: [{ $project: { name: 1 } }],
            as: "lastEditedByUser",
          },
        },
        {
          $addFields: {
            lastEditedByName: { $arrayElemAt: ["$lastEditedByUser.name", 0] },
          },
        },
        { $project: { lastEditedByUser: 0, lastEditedBy: 0 } },
      ],
      count: [{ $count: "n" }],
    },
  });

  const [facetResult, pendingConflictCount, role, openImports] = await Promise.all([
    Item.aggregate(pipeline).collation({ locale: "en", numericOrdering: true }),
    CatalogConflict.countDocuments({ status: "pending" }),
    getSessionRole(),
    ImportBatch.find({ status: "needs_review" })
      .select("sourceFileName totalRows")
      .sort({ uploadedAt: -1 })
      .limit(1)
      .lean(),
  ]);
  const isAdmin = role === "administrator";
  const canExport = roleCan(role, ROLE_SETS.catalogExport);
  const openImport = isAdmin ? openImports[0] : undefined;
  const canApprove = isAdmin;
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
    conflictCount?: number;
  }>;
  const total: number = facetResult[0]?.count?.[0]?.n ?? 0;

  const filterState = {
    q,
    category,
    brand,
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
    brand: brand || undefined,
    plating: plating || undefined,
    minPrice: sp.minPrice || undefined,
    maxPrice: sp.maxPrice || undefined,
    sort: sort === "sku" ? undefined : sort,
  };

  return (
    <AppShell activeHref="/catalog" eyebrow="Finalized database" title="Catalog">
      <p className="text-ink-soft max-w-[68ch] mb-3 text-[0.92rem]">
        The company&apos;s verified product database: Master File items, hand-added items, and
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
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Catalog items" value={counts.total.toLocaleString()} icon={BookOpenCheck} tone="brass" />
        <StatCard
          label="Complete"
          value={`${counts.complete.toLocaleString()}${
            counts.total > 0 ? ` (${Math.round((counts.complete / counts.total) * 100)}%)` : ""
          }`}
          icon={CircleCheck}
          tone="good"
        />
        <StatCard label="Incomplete" value={counts.incomplete.toLocaleString()} icon={CircleDashed} tone="warn" />
        <StatCard label="Pending approval" value={counts.pendingApproval.toLocaleString()} icon={Hourglass} tone="neutral" />
      </div>

      {openImport && (
        <Card className="mb-5 flex items-center gap-3.5">
          <ListChecks size={18} className="text-brass shrink-0" />
          <div className="flex-1 text-[0.86rem]">
            <span className="font-semibold">Master File import waiting for review:</span>{" "}
            <span className="text-ink-soft">
              {openImport.sourceFileName} ({openImport.totalRows} rows). Nothing is in the catalog until it&apos;s committed.
            </span>
          </div>
          <Link
            href={`/catalog/import/${openImport._id}`}
            className="font-body font-semibold text-[0.85rem] px-3.5 py-2 rounded-sm bg-brass-bg text-brass no-underline hover:brightness-110"
          >
            Continue review
          </Link>
        </Card>
      )}

      {pendingConflictCount > 0 && (
        <Card className="mb-5 border-warn flex items-center gap-3.5">
          <TriangleAlert size={18} className="text-warn shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-[0.92rem] mb-1">
              {pendingConflictCount} unresolved conflict{pendingConflictCount === 1 ? "" : "s"} from new PIs
            </div>
            <div className="text-[0.82rem] text-ink-soft">
              A new PI tried to change weight, size, or vendor SKU on a catalog item. The stored value
              stays until each one is reviewed.
            </div>
          </div>
          <Link
            href="/catalog/conflicts"
            className="font-body font-semibold text-[0.85rem] px-3.5 py-2 rounded-sm bg-warn-bg text-warn border border-warn-bg no-underline hover:brightness-110"
          >
            Review
          </Link>
        </Card>
      )}

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.value;
          const params = new URLSearchParams();
          if (t.value !== "all") params.set("filter", t.value);
          if (q) params.set("q", q);
          if (category) params.set("category", category);
          if (brand) params.set("brand", brand);
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
        categories={categories}
        brands={brands}
        platings={platings}
      />

      <CatalogSelectionProvider
        enabled={canExport}
        pageItems={items.map((it) => ({ id: String(it._id), sku: it.itemNumber ?? "" }))}
      >
      {canExport && (
        <CatalogExportBar
          total={total}
          filters={{
            filter: tab === "all" ? undefined : tab,
            q: q || undefined,
            category: category || undefined,
            brand: brand || undefined,
            plating: plating || undefined,
            minPrice: sp.minPrice || undefined,
            maxPrice: sp.maxPrice || undefined,
          }}
        />
      )}
      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No items match these filters.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              {canExport && <col className="w-[40px]" />}
              <col className="w-[11%]" />
              <col className={canExport ? "w-[13%]" : "w-[16%]"} />
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
                {canExport && (
                  <th className={`${TH_CLASS} !px-3`}>
                    <PageSelect />
                  </th>
                )}
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
                    {canExport && (
                      <td className={`${TD_CLASS} !px-3`}>
                        <RowSelect id={String(it._id)} sku={it.itemNumber ?? ""} />
                      </td>
                    )}
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
                        conflictCount={it.conflictCount ?? 0}
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
      </CatalogSelectionProvider>
    </AppShell>
  );
}
