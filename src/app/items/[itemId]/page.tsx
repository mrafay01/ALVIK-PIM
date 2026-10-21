import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import Item from "@/models/Item";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { SectionCard, FieldGrid, DetailField } from "@/components/ui/SectionCard";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";
import { ItemActions } from "./ItemActions";
import { MediaUpload } from "./MediaUpload";
import { ItemDetailSection } from "./ItemDetailSection";
import { ItemActiveToggle } from "./ItemActiveToggle";
import { ItemEditButton } from "./ItemEditButton";
import { MarketplaceDescriptions } from "./MarketplaceDescriptions";
import { DESCRIPTION_PLATFORMS, type DescriptionPlatform } from "@/lib/enums";
import { isMarketplaceDescriptionOverridden } from "@/lib/marketplaceDescription";
import { MeasurementsDisplay } from "@/components/ui/MeasurementsDisplay";
import type { ItemMeasurements } from "@/lib/measurements/types";
import { findSiblingVariations } from "@/lib/catalog/variationFamily";
import { ChangeHistory } from "./ChangeHistory";
import { DollarSign, GitBranch, Layers, History, Copy } from "lucide-react";
import { isObjectId } from "@/lib/ids";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n === null || n === undefined) return "—";
  return `${currency ?? "USD"} ${n.toFixed(2)}`;
}

// `specs` is an intentionally open (strict:false) sub-schema — legacy
// Master File / quote-import columns (mainStoneInfo, allSpecs, etc.)
// land on it at runtime but aren't part of the declared Mongoose type.
type OpenSpecs = Record<string, unknown>;
function openSpecs(specs: unknown): OpenSpecs {
  return (specs ?? {}) as OpenSpecs;
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  if (!isObjectId(itemId)) notFound();
  await connectDB();

  const [role, item] = await Promise.all([
    getSessionRole(),
    Item.findById(itemId).populate("vendorId", "name").lean(),
  ]);
  if (!item) notFound();
  const canEditItem = roleCan(role, ROLE_SETS.items);
  const canUploadMedia = roleCan(role, ROLE_SETS.media);

  const siblingVariations = await findSiblingVariations(item);

  const latestPricing = item.pricingHistory?.[item.pricingHistory.length - 1];
  const specs = openSpecs(item.specs);
  const vendorName = (item.vendorId as unknown as { name?: string } | null)?.name;

  const marketplaceDescriptionsRaw = item.marketplaceDescriptions as
    | Record<string, { text?: string } | undefined>
    | undefined;
  const marketplaceDescriptionsInitial = Object.fromEntries(
    DESCRIPTION_PLATFORMS.map((p) => [
      p,
      {
        text: marketplaceDescriptionsRaw?.[p]?.text ?? "",
        overridden: isMarketplaceDescriptionOverridden(item, p),
      },
    ])
  ) as Record<DescriptionPlatform, { text: string; overridden: boolean }>;

  return (
    <AppShell
      activeHref={item.inCatalog ? "/catalog" : "/items"}
      backHref={item.inCatalog ? "/catalog" : "/items"}
      backLabel={item.inCatalog ? "Catalog" : "Un-Verified Items"}
      eyebrow="Item detail"
      title={item.title || item.vendorSku || "Item"}
    >
      <div className="flex flex-col gap-6 max-w-[1180px]">
        {/* ---------- Header / overview ---------- */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2.5">
                <Pill tone={ITEM_STATUS_TONE[item.status as keyof typeof ITEM_STATUS_TONE]}>
                  {ITEM_STATUS_LABEL[item.status as keyof typeof ITEM_STATUS_LABEL]}
                </Pill>
                <Pill tone={item.active === false ? "neutral" : "good"} dot>
                  {item.active === false ? "Inactive" : "Active"}
                </Pill>
                {item.itemNumber && (
                  <span className="font-mono text-[0.8rem] text-ink-faint">{item.itemNumber}</span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-ink m-0 mb-1 break-words">
                {item.title || "Untitled item"}
              </h1>
              <p className="text-[0.85rem] text-ink-soft m-0">
                {[vendorName, item.category, item.vendorSku ? `SKU ${item.vendorSku}` : null]
                  .filter(Boolean)
                  .join(" · ") || "No vendor, category, or SKU set yet"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {canEditItem && <ItemEditButton itemId={String(item._id)} />}
              <ItemActiveToggle
                itemId={String(item._id)}
                active={item.active !== false}
                canEdit={canEditItem}
              />
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <FieldGrid>
              <DetailField label="Vendor" value={vendorName} />
              <DetailField label="Base SKU" value={item.baseSku} />
              <DetailField label="Variant suffix" value={item.variantSuffix} />
              <DetailField label="Sample SKU" value={item.sampleSku} />
              <DetailField label="Brand" value={item.brand} />
              <DetailField label="UPC" value={item.upc} />
              <DetailField label="2nd UPC" value={item.upc2} />
              <DetailField label="Alias SKU" value={item.aliasSku} />
              <DetailField label="Metal" value={item.specs?.metal} />
              <DetailField label="Plating" value={item.specs?.plating} />
              <DetailField label="Gender" value={item.specs?.gender} />
              <DetailField label="Collection" value={item.collectionName} />
              <DetailField label="Season" value={item.season} />
              <DetailField label="Box number" value={item.boxNumber} />
            </FieldGrid>
          </div>

          {(item.description || item.bulletFeatures?.length) && (
            <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
              <div>
                <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                  Description
                </span>
                <p className="text-[0.87rem] text-ink mt-1.5 mb-0 whitespace-pre-wrap">
                  {item.description || "—"}
                </p>
              </div>
              {item.bulletFeatures && item.bulletFeatures.length > 0 && (
                <div>
                  <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                    Feature points
                  </span>
                  <ul className="mt-1.5 mb-0 pl-4 text-[0.87rem] text-ink">
                    {item.bulletFeatures.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Change history — only interesting after an item is in the catalog,
            which is when its authoritative fields become subject to the
            conflict/change-log flow. Pipeline items don't accumulate rows
            here, so showing an empty accordion would just be noise. */}
        {item.inCatalog && <ChangeHistory itemId={String(item._id)} />}

        {/* ---------- Pricing & lifecycle ---------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <SectionCard title="Pricing" icon={<DollarSign size={16} />}>
            <FieldGrid>
              <DetailField
                label="Latest cost / unit"
                value={fmtMoney(latestPricing?.costPerUnit, latestPricing?.currency)}
              />
              <DetailField label="Latest MSRP" value={fmtMoney(latestPricing?.msrp, latestPricing?.currency)} />
              <DetailField
                label="Latest Rue price"
                value={fmtMoney(latestPricing?.ruePrice, latestPricing?.currency)}
              />
              <DetailField label="Effective date" value={fmtDate(latestPricing?.effectiveDate)} />
            </FieldGrid>
            {item.pricingHistory && item.pricingHistory.length > 1 && (
              <div className="mt-4 pt-4 border-t border-border">
                <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                  Full history ({item.pricingHistory.length} entries)
                </span>
                <div className="flex flex-col gap-1.5 mt-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {[...item.pricingHistory].reverse().map((p, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8rem] px-3 py-2 rounded-sm bg-surface-sunken"
                    >
                      <span className="text-ink-faint font-mono w-[88px] shrink-0">{fmtDate(p.effectiveDate)}</span>
                      <span>cost {fmtMoney(p.costPerUnit, p.currency)}</span>
                      <span>msrp {fmtMoney(p.msrp, p.currency)}</span>
                      <span>rue {fmtMoney(p.ruePrice, p.currency)}</span>
                      {p.source && <span className="text-ink-faint">({p.source})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Lifecycle & origin" icon={<GitBranch size={16} />}>
            <FieldGrid>
              <DetailField
                label="Review decision"
                value={
                  item.reviewDecision?.decision
                    ? `${item.reviewDecision.decision}${item.reviewDecision.note ? ` (${item.reviewDecision.note})` : ""}`
                    : "pending"
                }
              />
              <DetailField label="Reviewed" value={fmtDate(item.reviewDecision?.decidedAt)} />
              <DetailField label="Origin" value={item.origin} />
              <DetailField label="Urgency" value={item.urgency} />
              <DetailField label="Order reason" value={item.orderReason} />
              <DetailField label="Master record complete" value={item.masterRecordComplete ? "Yes" : "No"} />
              <DetailField label="In catalog" value={item.inCatalog ? "Yes" : "No"} />
              <DetailField label="Catalog approval" value={item.catalogApproval?.status} />
              <DetailField label="Catalog submitted" value={fmtDate(item.catalogSubmittedAt)} />
              <DetailField label="Rejection reason" value={item.rejectionReason} />
              <DetailField label="Created" value={fmtDate(item.createdAt)} />
              <DetailField label="Last updated" value={fmtDate(item.updatedAt)} />
            </FieldGrid>
          </SectionCard>
        </div>

        {/* ---------- Specs ---------- */}
        <div className="flex flex-col gap-5">
          <ItemDetailSection title="Weight & stones" defaultOpen>
            <DetailField label="Total weight" value={item.specs?.weight?.totalG} />
            <DetailField label="Silver weight" value={item.specs?.weight?.silverG} />
            <DetailField label="Main stone info" value={specs.mainStoneInfo as string | undefined} />
            <DetailField label="Main stone color" value={specs.mainStoneColor as string | undefined} />
            <DetailField label="Main stone type" value={specs.mainStoneType as string | undefined} />
            <DetailField label="Rest stone info" value={specs.restStoneInfo as string | undefined} />
            <DetailField label="Rest stone color" value={specs.restStoneColor as string | undefined} />
            <DetailField label="Rest stone type" value={specs.restStoneType as string | undefined} />
            <DetailField label="Stone setting" value={specs.stoneSetting as string | undefined} />
            <DetailField label="Pearl size" value={specs.pearlSize as string | undefined} />
            <DetailField label="Pearl type" value={specs.pearlType as string | undefined} />
            <DetailField label="TCW" value={item.specs?.tcw} />
            <DetailField label="Total carat weight" value={specs.totalCaratWeight as string | undefined} />
            <DetailField label="Birthstone" value={item.specs?.birthstone} />
            <DetailField label="Discontinued flag" value={specs.discontinuedFlag ? "Yes" : null} />
            <DetailField label="New MSRP date" value={fmtDate(specs.newMsrpDate as string | Date | undefined)} />
          </ItemDetailSection>

          <ItemDetailSection title="Findings & specs" hint="clasp, misc. spec text">
            <DetailField label="Clasp" value={item.specs?.clasp} />
            <DetailField label="All specs" value={specs.allSpecs as string | undefined} />
            <DetailField label="Title #2" value={item.title2} />
            <DetailField label="Description #2" value={item.description2} />
          </ItemDetailSection>
        </div>

        {/* ---------- Structured, category-specific measurements ---------- */}
        <MeasurementsDisplay
          category={item.category}
          measurements={item.measurements as ItemMeasurements | undefined}
        />

        {/* ---------- Sibling variations ---------- */}
        {siblingVariations.length > 0 && (
          <SectionCard
            title="Variations"
            icon={<Copy size={16} />}
            meta={`${siblingVariations.length + 1} in this family`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-brass-bg border border-[color:var(--brass-glow)]">
                <div className="min-w-0">
                  <span className="font-mono text-[0.82rem] font-semibold text-ink block truncate">
                    {item.itemNumber ?? item.sampleSku ?? "this item"}
                  </span>
                  <span className="text-[0.72rem] text-ink-faint">Currently viewing</span>
                </div>
              </div>
              {siblingVariations.map((sib) => (
                <a
                  key={String(sib._id)}
                  href={`/items/${sib._id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-surface-sunken no-underline hover:bg-surface-overlay transition-colors duration-150"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[0.82rem] font-semibold text-ink block truncate">
                      {sib.itemNumber ?? "—"}
                    </span>
                    <span className="text-[0.72rem] text-ink-faint">
                      {[sib.variantSuffix, sib.specs?.plating].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {sib.active === false && (
                    <span className="text-[0.68rem] text-ink-faint shrink-0 ml-2">Inactive</span>
                  )}
                </a>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ---------- Marketplace descriptions ---------- */}
        <MarketplaceDescriptions
          itemId={String(item._id)}
          generalDescription={item.description ?? ""}
          initial={marketplaceDescriptionsInitial}
          canEdit={canEditItem}
        />

        {/* ---------- History / auxiliary data ---------- */}
        {((item.costHistory && item.costHistory.length > 0) ||
          (item.customFields && Object.keys(item.customFields).length > 0)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {item.costHistory && item.costHistory.length > 0 && (
              <SectionCard title="Cost history" icon={<History size={16} />} meta="per-PO snapshots">
                <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {[...item.costHistory].reverse().map((c, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8rem] px-3 py-2 rounded-sm bg-surface-sunken"
                    >
                      <span className="text-ink-faint font-mono w-[88px] shrink-0">{fmtDate(c.recordedAt)}</span>
                      <span>labor/g {c.laborCostPerGram ?? "—"}</span>
                      <span>material/g {c.materialCostPerGram ?? "—"}</span>
                      <span>qty {c.qty ?? "—"}</span>
                      <span>total {c.total ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {item.customFields && Object.keys(item.customFields).length > 0 && (
              <SectionCard
                title="Custom fields"
                icon={<Layers size={16} />}
                meta="from a vendor quote"
              >
                <FieldGrid>
                  {Object.entries(item.customFields as unknown as Record<string, string>).map(
                    ([label, value]) => (
                      <DetailField key={label} label={label} value={value} />
                    )
                  )}
                </FieldGrid>
              </SectionCard>
            )}
          </div>
        )}

        {/* ---------- Images ---------- */}
        <MediaUpload
          itemId={String(item._id)}
          folderKey={item.itemNumber || item.sampleSku || null}
          canUpload={canUploadMedia}
          initialMedia={(item.media ?? []).map((m) => ({
            sharePointItemId: m.sharePointItemId,
            url: m.url,
            name: m.name ?? null,
            subfolder: m.subfolder as "main" | "sides" | "models",
            linkStatus: (m.linkStatus as "ok" | "broken" | undefined) ?? null,
          }))}
          initialCompleteness={{
            main: !!item.imageCompleteness?.main,
            sides: !!item.imageCompleteness?.sides,
            models: !!item.imageCompleteness?.models,
          }}
        />

        {/* ---------- Pipeline actions ---------- */}
        {canEditItem && (
          <ItemActions
            itemId={String(item._id)}
            vendorId={String(
              item.vendorId && typeof item.vendorId === "object"
                ? (item.vendorId as { _id: unknown })._id
                : item.vendorId
            )}
            status={item.status}
            hasReviewDecision={!!item.reviewDecision?.decision}
            hasSampleSku={!!item.sampleSku}
          />
        )}
      </div>
    </AppShell>
  );
}
