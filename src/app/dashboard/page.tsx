import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import Payment from "@/models/Payment";
import Quotation from "@/models/Quotation";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { HBarChart, type HBarDatum } from "@/components/ui/charts/HBarChart";
import { DonutChart } from "@/components/ui/charts/DonutChart";
import { TrendBars } from "@/components/ui/charts/TrendBars";
import { TriangleAlert, Clock, Wallet, ArrowRight, Camera, CloudUpload, ImageOff, ImageDown } from "lucide-react";
import { PO_STATUSES } from "@/lib/enums";
import { PO_STATUS_LABEL, PO_STATUS_TONE, ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";

export const dynamic = "force-dynamic";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

function weekLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A card whose header links out to the page that owns the data it shows —
// every chart/table on this dashboard is a summary of somewhere else in the
// app, so the click target is never a dead end. `href` is optional: a card
// summarizing something with no page of its own (e.g. in-progress items,
// which have no standalone list) renders its header as plain text instead
// of faking a link.
function LinkedCard({
  href,
  title,
  subtitle,
  children,
}: {
  href?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const header = (
    <div className="min-w-0">
      <h2 className={`text-[0.95rem] ${href ? "group-hover:text-brass transition-colors duration-150" : ""}`}>
        {title}
      </h2>
      {subtitle && <p className="text-ink-faint text-[0.78rem] mt-1 mb-0">{subtitle}</p>}
    </div>
  );

  return (
    <Card className={href ? "czc-card-link" : ""} padding={0}>
      {href ? (
        <Link href={href} className="flex items-center justify-between gap-3 px-[22px] pt-[22px] pb-1 no-underline group">
          {header}
          <ArrowRight
            size={16}
            strokeWidth={2}
            className="shrink-0 text-ink-faint group-hover:text-brass group-hover:translate-x-0.5 transition-[color,transform] duration-150"
          />
        </Link>
      ) : (
        <div className="px-[22px] pt-[22px] pb-1">{header}</div>
      )}
      <div className="px-[22px] pb-[22px] pt-4">{children}</div>
    </Card>
  );
}

export default async function DashboardPage() {
  await connectDB();

  const now = new Date();
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Batch all Item and PurchaseOrder counts into aggregation pipelines using $facet
  // to reduce from ~15 separate queries to 3 batch calls (Item, PurchaseOrder, Payment).
  const [itemMetrics, poMetrics, recentItems, quotationsNeedingReview, payablesDueSoon] = await Promise.all([
    Item.aggregate([
      {
        $facet: {
          incompleteCatalog: [
            { $match: { inCatalog: true, masterRecordComplete: false } },
            { $count: "count" },
          ],
          catalogPending: [
            { $match: { inCatalog: true, "catalogApproval.status": "pending" } },
            { $count: "count" },
          ],
          catalogComplete: [
            { $match: { inCatalog: true, masterRecordComplete: true } },
            { $count: "count" },
          ],
          catalogIncomplete: [
            {
              $match: {
                inCatalog: true,
                masterRecordComplete: false,
                $or: [{ "catalogApproval.status": { $ne: "pending" } }, { catalogApproval: { $exists: false } }],
              },
            },
            { $count: "count" },
          ],
          itemsNoImages: [
            { $match: { $or: [{ media: { $exists: false } }, { media: { $size: 0 } }] } },
            { $count: "count" },
          ],
          itemsFullImages: [
            {
              $match: {
                "imageCompleteness.main": true,
                "imageCompleteness.sides": true,
                "imageCompleteness.models": true,
              },
            },
            { $count: "count" },
          ],
          itemsPartialImages: [
            {
              $match: {
                media: { $exists: true, $not: { $size: 0 } },
                $or: [
                  { "imageCompleteness.main": { $ne: true } },
                  { "imageCompleteness.sides": { $ne: true } },
                  { "imageCompleteness.models": { $ne: true } },
                ],
              },
            },
            { $count: "count" },
          ],
          itemsCreated: [
            { $match: { createdAt: { $gte: twelveWeeksAgo } } },
            {
              $group: {
                _id: { $dateTrunc: { date: "$createdAt", unit: "week", timezone: "UTC" } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
    PurchaseOrder.aggregate([
      {
        $facet: {
          statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          imageStatusPending: [{ $match: { imageStatus: "pending" } }, { $count: "count" }],
          imageStatusWithPhotographer: [
            { $match: { imageStatus: { $in: ["sent_to_photo_guy", "submitted_on_fiverr"] } } },
            { $count: "count" },
          ],
          imageStatusReceived: [
            { $match: { imageStatus: { $in: ["images_received", "received"] } } },
            { $count: "count" },
          ],
        },
      },
    ]),
    Item.find({ inCatalog: { $ne: true } })
      .select("itemNumber sampleSku title status vendorId updatedAt")
      .populate("vendorId", "name")
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean(),
    Quotation.countDocuments({ status: "needs_review" }),
    Payment.countDocuments({
      status: { $in: ["open", "deposit_submitted"] },
      dueDate: { $lte: sevenDaysFromNow },
    }),
  ]);

  // Extract counts from facet results
  const incompleteCatalogItems = itemMetrics[0].incompleteCatalog[0]?.count ?? 0;
  const pendingCatalogApproval = itemMetrics[0].catalogPending[0]?.count ?? 0;
  const catalogCompleteCount = itemMetrics[0].catalogComplete[0]?.count ?? 0;
  const catalogIncompleteCount = itemMetrics[0].catalogIncomplete[0]?.count ?? 0;
  const itemsNoImages = itemMetrics[0].itemsNoImages[0]?.count ?? 0;
  const itemsFullImages = itemMetrics[0].itemsFullImages[0]?.count ?? 0;
  const itemsPartialImages = itemMetrics[0].itemsPartialImages[0]?.count ?? 0;
  const recentItemsCreated = itemMetrics[0].itemsCreated;

  const poStatusCounts = poMetrics[0].statusCounts;
  const poImagePending = poMetrics[0].imageStatusPending[0]?.count ?? 0;
  const poImageWithPhotographer = poMetrics[0].imageStatusWithPhotographer[0]?.count ?? 0;
  const poImageReceived = poMetrics[0].imageStatusReceived[0]?.count ?? 0;

  const poStatusMap = new Map(
    (poStatusCounts as Array<{ _id: string; count: number }>).map((r) => [r._id, r.count])
  );
  const poStatusData: HBarDatum[] = PO_STATUSES.filter((s) => (poStatusMap.get(s) ?? 0) > 0).map((s) => ({
    label: PO_STATUS_LABEL[s],
    value: poStatusMap.get(s) ?? 0,
    tone: PO_STATUS_TONE[s],
  }));

  const catalogCompletenessData = [
    { label: "Complete", value: catalogCompleteCount },
    { label: "Pending approval", value: pendingCatalogApproval },
    { label: "Incomplete", value: catalogIncompleteCount },
  ];
  const catalogTotal = catalogCompletenessData.reduce((s, d) => s + d.value, 0);

  // Fill in the full 12-week range so weeks with zero items still show a bar.
  const weekBuckets = new Map(
    (recentItemsCreated as Array<{ _id: Date; count: number }>).map((r) => [
      new Date(r._id).toISOString().slice(0, 10),
      r.count,
    ])
  );
  const trendData = Array.from({ length: 12 }).map((_, i) => {
    const weekStart = new Date(twelveWeeksAgo.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    weekStart.setUTCHours(0, 0, 0, 0);
    // Align to the same week-truncation Mongo used (UTC week start, Sunday).
    const day = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - day);
    const key = weekStart.toISOString().slice(0, 10);
    return { label: weekLabel(weekStart), value: weekBuckets.get(key) ?? 0 };
  });

  const alerts: { icon: typeof TriangleAlert; text: string; href: string; tone: "warn" | "critical" }[] = [];
  if (quotationsNeedingReview > 0) {
    alerts.push({
      icon: TriangleAlert,
      text: `${quotationsNeedingReview} vendor quote${quotationsNeedingReview === 1 ? "" : "s"} waiting for review`,
      href: "/purchase-orders/quotes",
      tone: "warn",
    });
  }
  if (pendingCatalogApproval > 0) {
    alerts.push({
      icon: Clock,
      text: `${pendingCatalogApproval} catalog item${pendingCatalogApproval === 1 ? "" : "s"} pending admin approval`,
      href: "/catalog?filter=pending",
      tone: "warn",
    });
  }
  if (payablesDueSoon > 0) {
    alerts.push({
      icon: Wallet,
      text: `${payablesDueSoon} payment${payablesDueSoon === 1 ? "" : "s"} due within 7 days`,
      href: "/payables",
      tone: "critical",
    });
  }
  if (incompleteCatalogItems > 0) {
    alerts.push({
      icon: TriangleAlert,
      text: `${incompleteCatalogItems} catalog item${incompleteCatalogItems === 1 ? "" : "s"} missing required fields`,
      href: "/catalog?filter=incomplete",
      tone: "warn",
    });
  }

  return (
    <AppShell activeHref="/dashboard" eyebrow="Overview" title="Dashboard">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        A snapshot of the whole pipeline (items, purchase orders, catalog, and payables) as of
        right now.
      </p>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2 mb-7">
          {alerts.map((a) => (
            <Link
              key={a.text}
              href={a.href}
              className={`czc-card-link flex items-center gap-3 px-4 py-3 rounded-md border text-[0.85rem] no-underline ${
                a.tone === "critical"
                  ? "bg-critical-bg border-[color:var(--critical)] text-critical"
                  : "bg-warn-bg border-[color:var(--warn)] text-warn"
              }`}
            >
              <a.icon size={16} strokeWidth={2} className="shrink-0" />
              <span className="flex-1">{a.text}</span>
              <span className="text-[0.78rem] opacity-80">View →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 mb-5">
        <LinkedCard
          href="/purchase-orders"
          title="Purchase orders by status"
          subtitle="Vendor PO pipeline, sample through received."
        >
          {poStatusData.length === 0 ? (
            <p className="text-ink-faint text-[0.85rem] m-0">No purchase orders yet.</p>
          ) : (
            <HBarChart data={poStatusData} />
          )}
        </LinkedCard>

        <LinkedCard
          href="/catalog"
          title="Catalog completeness"
          subtitle="Every catalog item, by publish-readiness."
        >
          {catalogTotal === 0 ? (
            <p className="text-ink-faint text-[0.85rem] m-0">No catalog items yet.</p>
          ) : (
            <DonutChart data={catalogCompletenessData} />
          )}
        </LinkedCard>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-5 mb-5">
        <LinkedCard
          title="Items created, last 12 weeks"
          subtitle="New items entering the pipeline, by week."
        >
          <TrendBars data={trendData} />
        </LinkedCard>

        <LinkedCard title="Image pipeline" subtitle="From photographer through SharePoint upload.">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-good-bg shrink-0">
                <CloudUpload size={16} strokeWidth={2} className="text-good" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">Fully uploaded to SharePoint</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{itemsFullImages}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-brass-bg shrink-0">
                <ImageDown size={16} strokeWidth={2} className="text-brass" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">Partially uploaded</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{itemsPartialImages}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-critical-bg shrink-0">
                <ImageOff size={16} strokeWidth={2} className="text-critical" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">No images uploaded yet</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{itemsNoImages}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-warn-bg shrink-0">
                <Camera size={16} strokeWidth={2} className="text-warn" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">POs waiting on photographer</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{poImageWithPhotographer}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-neutral-pill shrink-0">
                <Clock size={16} strokeWidth={2} className="text-ink-faint" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">POs not yet sent for photos</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{poImagePending}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-sm bg-good-bg shrink-0">
                <Camera size={16} strokeWidth={2} className="text-good" />
              </span>
              <span className="flex-1 text-[0.83rem] text-ink-soft">POs with photos received</span>
              <span className="font-mono text-[0.9rem] font-semibold text-ink">{poImageReceived}</span>
            </div>
          </div>
        </LinkedCard>
      </div>

      <LinkedCard
        title="Recently updated vendor items"
        subtitle="The last in-progress items touched, across every status."
      >
        {recentItems.length === 0 ? (
          <p className="text-ink-faint text-[0.85rem] m-0">No vendor items in progress.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH_CLASS}>SKU</th>
                <th className={TH_CLASS}>Title</th>
                <th className={TH_CLASS}>Vendor</th>
                <th className={TH_CLASS}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentItems.map((it) => (
                <tr key={String(it._id)} className="czc-row">
                  <td className={TD_CLASS}>
                    <Link href={`/items/${it._id}`} className="text-brass no-underline font-mono">
                      {it.itemNumber ?? it.sampleSku ?? "—"}
                    </Link>
                  </td>
                  <td className={`${TD_CLASS} text-ink-soft`}>{it.title ?? "—"}</td>
                  <td className={`${TD_CLASS} text-ink-soft`}>
                    {(it.vendorId as unknown as { name?: string } | undefined)?.name ?? "—"}
                  </td>
                  <td className={TD_CLASS}>
                    <Pill tone={ITEM_STATUS_TONE[it.status as keyof typeof ITEM_STATUS_TONE]}>
                      {ITEM_STATUS_LABEL[it.status as keyof typeof ITEM_STATUS_LABEL]}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </LinkedCard>
    </AppShell>
  );
}
