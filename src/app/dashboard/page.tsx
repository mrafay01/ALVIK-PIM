import Link from "next/link";
import { unstable_cache } from "next/cache";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSession, roleCan, ROLE_SETS } from "@/lib/authz";
import type { Role } from "@/lib/enums";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import Quotation from "@/models/Quotation";
import CatalogConflict from "@/models/CatalogConflict";
import ImportBatchRow from "@/models/ImportBatchRow";
import { ON_FLAGGED_PAGE } from "@/lib/import/reviewQuery";
import "@/models/Vendor";
import { TrendBars } from "@/components/ui/charts/TrendBars";
import { Pill } from "@/components/ui/Pill";
import {
  ClipboardList,
  BookOpenCheck,
  PackageSearch,
  BellRing,
  FileUp,
  Plus,
  RefreshCw,
  ImagePlus,
  Clock,
  ShieldAlert,
  FileSpreadsheet,
  Link2Off,
  Camera,
  CalendarClock,
  Flag,
} from "lucide-react";
import { PO_STATUSES } from "@/lib/enums";
import { PO_STATUS_LABEL, PO_STATUS_TONE, ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";
import { OPEN_PO_CONDITIONS } from "@/lib/purchase-orders/listQuery";
import { KpiTile, Panel, PipelineFlow, AttentionList, Ring, LegendRow, CoverageBar, ago } from "./parts";

export const dynamic = "force-dynamic";

const WEEK = 7 * 24 * 60 * 60 * 1000;

function count(facet: { n: number }[] | undefined): number {
  return facet?.[0]?.n ?? 0;
}

type Facet = { n: number }[];
type DashboardCounts = {
  po: Record<string, Facet | { _id: string; n: number }[]>;
  it: Record<string, Facet | { _id: string; n: number }[]>;
  quotesToReview: number;
  pendingConflicts: number;
};

// The whole-collection counts behind the dashboard: two aggregations that
// read every PO and every item, plus two counts. They're the same for every
// user, so they're computed at most once per 30 seconds rather than on
// every visit. (Dates in the result come back as strings from the cache.)
const loadDashboardCounts = unstable_cache(
  async (): Promise<DashboardCounts> => {
    await connectDB();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK);
    const twelveWeeksAgo = new Date(now.getTime() - 12 * WEEK);
    const unverifiedMatch = { inCatalog: { $ne: true }, intakeSource: { $in: ["manual_quote", "monday_pull"] } };

    const [poFacets, itemFacets, quotesToReview, pendingConflicts] = await Promise.all([
      PurchaseOrder.aggregate([
        // Filter first so the projection only runs over open POs.
        { $match: { $and: OPEN_PO_CONDITIONS } },
        { $project: { status: 1, mondayStatusMapped: 1, requestDate: 1, imageStatus: 1 } },
        {
          $facet: {
            byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
            total: [{ $count: "n" }],
            overdue: [{ $match: { requestDate: { $lt: now } } }, { $count: "n" }],
            sideLane: [{ $match: { mondayStatusMapped: false } }, { $count: "n" }],
            withPhotographer: [
              { $match: { imageStatus: { $in: ["sent_to_photo_guy", "submitted_on_fiverr"] } } },
              { $count: "n" },
            ],
          },
        },
      ]),
      Item.aggregate([
        // Only the fields the facets read, not whole item documents.
        {
          $project: {
            inCatalog: 1,
            masterRecordComplete: 1,
            approval: "$catalogApproval.status",
            intakeSource: 1,
            createdAt: 1,
            main: "$imageCompleteness.main",
            sides: "$imageCompleteness.sides",
            models: "$imageCompleteness.models",
            mediaCount: { $size: { $ifNull: ["$media", []] } },
            broken: { $in: ["broken", { $ifNull: ["$media.linkStatus", []] }] },
          },
        },
        {
          $facet: {
            catalog: [{ $match: { inCatalog: true } }, { $count: "n" }],
            complete: [{ $match: { inCatalog: true, masterRecordComplete: true } }, { $count: "n" }],
            pendingApproval: [{ $match: { inCatalog: true, approval: "pending" } }, { $count: "n" }],
            catMain: [{ $match: { inCatalog: true, main: true } }, { $count: "n" }],
            catSides: [{ $match: { inCatalog: true, sides: true } }, { $count: "n" }],
            catModels: [{ $match: { inCatalog: true, models: true } }, { $count: "n" }],
            catNoImages: [{ $match: { inCatalog: true, mediaCount: 0 } }, { $count: "n" }],
            broken: [{ $match: { broken: true } }, { $count: "n" }],
            unverified: [{ $match: unverifiedMatch }, { $count: "n" }],
            unverifiedThisWeek: [{ $match: { ...unverifiedMatch, createdAt: { $gte: weekAgo } } }, { $count: "n" }],
            weekly: [
              { $match: { createdAt: { $gte: twelveWeeksAgo } } },
              { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "week", timezone: "UTC" } }, n: { $sum: 1 } } },
            ],
          },
        },
      ]),
      Quotation.countDocuments({ status: "needs_review" }),
      CatalogConflict.countDocuments({ status: "pending" }),
    ]);
    return { po: poFacets[0] ?? {}, it: itemFacets[0] ?? {}, quotesToReview, pendingConflicts };
  },
  ["dashboard-counts"],
  { revalidate: 30 }
);

// The overview: a few headline numbers, the open PO pipeline, what's
// waiting on someone, catalog and image health, and recent activity. Every
// number links to the page that owns it. "Open" POs use the same
// definition as the Purchase Orders list, so the thousands of finished
// Monday orders don't inflate the pipeline.
export default async function DashboardPage() {
  await connectDB();
  const session = await getSession();
  const role = session?.user?.role as Role | undefined;
  const firstName = (session?.user?.name ?? "").split(" ")[0];

  const now = new Date();
  const twelveWeeksAgo = new Date(now.getTime() - 12 * WEEK);
  const open = { $and: OPEN_PO_CONDITIONS };

  const [counts, recentPos, recentItems, flaggedRows] = await Promise.all([
    loadDashboardCounts(),
    PurchaseOrder.find(open)
      .select("poNumber status mondayStatusText vendorId updatedAt")
      .populate("vendorId", "name")
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean(),
    Item.find({})
      .select("itemNumber sampleSku title status inCatalog updatedAt")
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean(),
    role === "administrator" ? ImportBatchRow.countDocuments(ON_FLAGGED_PAGE) : Promise.resolve(0),
  ]);
  const { po, it, quotesToReview, pendingConflicts } = counts;
  const statusCount = new Map(
    ((po.byStatus as { _id: string; n: number }[] | undefined) ?? []).map((r) => [r._id, r.n])
  );
  const openPos = count(po.total);
  const overdue = count(po.overdue);
  const sideLane = count(po.sideLane);
  const withPhotographer = count(po.withPhotographer);
  const catalog = count(it.catalog);
  const complete = count(it.complete);
  const pendingApproval = count(it.pendingApproval);
  const incomplete = Math.max(0, catalog - complete - pendingApproval);
  const unverified = count(it.unverified);
  const unverifiedThisWeek = count(it.unverifiedThisWeek);
  const broken = count(it.broken);
  const catNoImages = count(it.catNoImages);

  const weekBuckets = new Map(
    ((it.weekly as { _id: Date; n: number }[] | undefined) ?? []).map((r) => [
      new Date(r._id).toISOString().slice(0, 10),
      r.n,
    ])
  );
  const trend = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(twelveWeeksAgo.getTime() + (i + 1) * WEEK);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Mongo's UTC week starts on Sunday
    return {
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: weekBuckets.get(d.toISOString().slice(0, 10)) ?? 0,
    };
  });
  const addedThisPeriod = trend.reduce((s, t) => s + t.value, 0);

  const stages = PO_STATUSES.filter((s) => s !== "shipment_received").map((s) => ({
    key: s,
    label: PO_STATUS_LABEL[s],
    count: statusCount.get(s) ?? 0,
    href: `/purchase-orders?lifecycle=open&status=${s}`,
  }));

  const attention = [
    {
      label: "Vendor quotes to review",
      detail: "Staged rows waiting for approval before they become items",
      count: quotesToReview,
      href: "/purchase-orders/quotes",
      icon: FileSpreadsheet,
      tone: "warn" as const,
    },
    {
      label: "PI conflicts",
      detail: "A new PI disagrees with the catalog on weight, size or vendor SKU",
      count: pendingConflicts,
      href: "/catalog/conflicts",
      icon: ShieldAlert,
      tone: "warn" as const,
    },
    {
      label: "Flagged Master File rows",
      detail: "Import rows waiting to be fixed before they reach the catalog",
      count: flaggedRows,
      href: "/catalog/flagged",
      icon: Flag,
      tone: "warn" as const,
    },
    {
      label: "Catalog approvals",
      detail: "Items submitted to the catalog, waiting for an admin",
      count: pendingApproval,
      href: "/catalog?filter=pending",
      icon: Clock,
      tone: "brass" as const,
    },
    {
      label: "Overdue purchase orders",
      detail: "Open POs past their requested date",
      count: overdue,
      href: "/purchase-orders?view=overdue",
      icon: CalendarClock,
      tone: "critical" as const,
    },
    {
      label: "Broken image links",
      detail: "Images whose file is no longer in SharePoint",
      count: broken,
      href: "/images?status=broken",
      icon: Link2Off,
      tone: "critical" as const,
    },
    {
      label: "POs with the photographer",
      detail: "Sent for photos or submitted on Fiverr",
      count: withPhotographer,
      href: "/purchase-orders?lifecycle=open",
      icon: Camera,
      tone: "neutral" as const,
    },
  ];
  const attentionTotal = quotesToReview + pendingConflicts + flaggedRows + pendingApproval + overdue + broken;

  const actions = [
    roleCan(role, ROLE_SETS.quotes) && {
      href: "/purchase-orders/quotes/import",
      label: "Import vendor PO",
      icon: FileUp,
      primary: true,
    },
    roleCan(role, ["marketplace_listing"]) && { href: "/catalog/new", label: "New catalog item", icon: Plus },
    roleCan(role, ROLE_SETS.media) && { href: "/images?status=missing", label: "Upload images", icon: ImagePlus },
    role === "administrator" && { href: "/admin/monday-pull", label: "Import from Monday", icon: RefreshCw },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Plus; primary?: boolean }[];

  return (
    <AppShell activeHref="/dashboard" eyebrow="Overview" title="Dashboard">
      {/* Greeting + quick actions */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.5rem] font-semibold text-ink m-0">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="mt-1 mb-0 text-[0.88rem] text-ink-soft">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
            {attentionTotal > 0
              ? `${attentionTotal} thing${attentionTotal === 1 ? "" : "s"} need${attentionTotal === 1 ? "s" : ""} attention`
              : "everything is up to date"}
          </p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`inline-flex items-center gap-1.5 rounded-sm px-3.5 py-2 text-[0.84rem] font-semibold no-underline transition-colors duration-150 ${
                  a.primary
                    ? "bg-brass text-on-brass border border-brass hover:bg-brass-hover"
                    : "bg-surface text-ink border border-border-strong hover:border-brass hover:text-brass"
                }`}
              >
                <a.icon size={15} /> {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Headline numbers */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          href="/purchase-orders?lifecycle=open"
          icon={ClipboardList}
          label="Open purchase orders"
          value={openPos}
          sub={overdue > 0 ? `${overdue} past the requested date` : "None overdue"}
          subTone={overdue > 0 ? "critical" : "good"}
        />
        <KpiTile
          href="/catalog"
          icon={BookOpenCheck}
          label="Catalog items"
          value={catalog}
          sub={
            catalog > 0
              ? `${Math.round((complete / catalog) * 100)}% ready to publish`
              : "Import the Master File to start"
          }
          subTone={catalog > 0 && complete === catalog ? "good" : "neutral"}
          tone="good"
        />
        <KpiTile
          href="/items"
          icon={PackageSearch}
          label="Un-verified items"
          value={unverified}
          sub={unverifiedThisWeek > 0 ? `+${unverifiedThisWeek} this week` : "None new this week"}
          tone="neutral"
        />
        <KpiTile
          href="#attention"
          icon={BellRing}
          label="Need attention"
          value={attentionTotal}
          sub={attentionTotal > 0 ? "Reviews, conflicts, approvals, overdue POs, broken images" : "All clear"}
          subTone={attentionTotal > 0 ? "warn" : "good"}
          tone={attentionTotal > 0 ? "warn" : "good"}
        />
      </div>

      {/* Pipeline + attention */}
      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
        <Panel
          title="Purchase order pipeline"
          subtitle={`${openPos.toLocaleString()} open POs by stage${
            sideLane > 0 ? ` · ${sideLane} in a Monday side-lane (Stuck, On hold, …)` : ""
          }`}
          href="/purchase-orders?lifecycle=open"
        >
          {openPos === 0 ? (
            <p className="m-0 text-[0.85rem] text-ink-faint">No open purchase orders.</p>
          ) : (
            <PipelineFlow stages={stages} />
          )}
        </Panel>

        <div id="attention" className="scroll-mt-24">
          <Panel title="Needs attention" subtitle="Work waiting on someone" className="h-full">
            <AttentionList items={attention} />
          </Panel>
        </div>
      </div>

      {/* Catalog health, images, intake */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Catalog health" subtitle="Publish-readiness of every catalog item" href="/catalog">
          {catalog === 0 ? (
            <p className="m-0 text-[0.85rem] text-ink-faint">No catalog items yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-5">
              <Ring value={complete} total={catalog} label="complete" />
              <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                <LegendRow color="var(--good)" label="Complete" value={complete} href="/catalog" />
                <LegendRow color="var(--brass)" label="Pending approval" value={pendingApproval} href="/catalog?filter=pending" />
                <LegendRow color="var(--ink-faint)" label="Missing fields" value={incomplete} href="/catalog?filter=incomplete" />
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Image coverage"
          subtitle="Catalog items with each image type in SharePoint"
          href="/images"
          linkLabel="Images"
        >
          {catalog === 0 ? (
            <p className="m-0 text-[0.85rem] text-ink-faint">No catalog items yet.</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              <CoverageBar label="Main image" value={count(it.catMain)} total={catalog} />
              <CoverageBar label="Side images" value={count(it.catSides)} total={catalog} />
              <CoverageBar label="Model images" value={count(it.catModels)} total={catalog} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[0.78rem]">
                <Link href="/images?scope=catalog&status=none" className="text-ink-soft no-underline hover:text-brass">
                  {catNoImages.toLocaleString()} with no images
                </Link>
                {broken > 0 && (
                  <Link href="/images?status=broken" className="text-critical no-underline">
                    {broken} with broken links
                  </Link>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Items added" subtitle={`${addedThisPeriod.toLocaleString()} in the last 12 weeks`}>
          <TrendBars data={trend} height={110} />
        </Panel>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Recently updated POs" href="/purchase-orders?lifecycle=open">
          {recentPos.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-ink-faint">No open purchase orders.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-[color:var(--border)] p-0">
              {recentPos.map((p) => (
                <li key={String(p._id)}>
                  <Link href={`/purchase-orders/${p._id}`} className="group flex items-center gap-3 py-2.5 no-underline">
                    <span className="w-[72px] shrink-0 font-mono text-[0.84rem] font-semibold text-ink group-hover:text-brass">
                      {p.poNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] text-ink-soft">
                      {(p.vendorId as unknown as { name?: string } | null)?.name ?? "—"}
                    </span>
                    {p.mondayStatusText && p.mondayStatusText !== PO_STATUS_LABEL[p.status as keyof typeof PO_STATUS_LABEL] ? (
                      <Pill tone="neutral">{p.mondayStatusText}</Pill>
                    ) : (
                      <Pill tone={PO_STATUS_TONE[p.status as keyof typeof PO_STATUS_TONE]}>
                        {PO_STATUS_LABEL[p.status as keyof typeof PO_STATUS_LABEL]}
                      </Pill>
                    )}
                    <span className="w-[64px] shrink-0 text-right text-[0.74rem] text-ink-faint">
                      {ago(p.updatedAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recently updated items" href="/catalog?sort=newest">
          {recentItems.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-ink-faint">No items yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-[color:var(--border)] p-0">
              {recentItems.map((i) => (
                <li key={String(i._id)}>
                  <Link href={`/items/${i._id}`} className="group flex items-center gap-3 py-2.5 no-underline">
                    <span className="w-[96px] shrink-0 truncate font-mono text-[0.84rem] font-semibold text-ink group-hover:text-brass">
                      {i.itemNumber ?? i.sampleSku ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] text-ink-soft">{i.title ?? "Untitled"}</span>
                    {i.inCatalog ? (
                      <Pill tone="good">catalog</Pill>
                    ) : (
                      <Pill tone={ITEM_STATUS_TONE[i.status as keyof typeof ITEM_STATUS_TONE]}>
                        {ITEM_STATUS_LABEL[i.status as keyof typeof ITEM_STATUS_LABEL]}
                      </Pill>
                    )}
                    <span className="w-[64px] shrink-0 text-right text-[0.74rem] text-ink-faint">
                      {ago(i.updatedAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
