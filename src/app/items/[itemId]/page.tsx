import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/statusDisplay";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { ItemActions } from "./ItemActions";
import { MediaUpload } from "./MediaUpload";
import { SubmitToCatalog } from "./SubmitToCatalog";
import { ItemDetailSection, DetailField } from "./ItemDetailSection";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n === null || n === undefined) return "—";
  return `${currency ?? "USD"} ${n.toFixed(2)}`;
}

// `specs` is an intentionally open (strict:false) sub-schema — legacy
// Master File / quote-import columns (mainStoneInfo, variationSku, etc.)
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
  await connectDB();

  const role = await getSessionRole();
  const canEditItem = roleCan(role, ROLE_SETS.items);
  const canUploadMedia = roleCan(role, ROLE_SETS.media);

  const item = await Item.findById(itemId).populate("vendorId", "name").lean();
  if (!item) notFound();

  const purchaseOrders = await PurchaseOrder.find({ "lineItems.itemId": itemId })
    .select("poNumber status poTotal updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  const latestPricing = item.pricingHistory?.[item.pricingHistory.length - 1];
  const specs = openSpecs(item.specs);

  const canManageCatalog = roleCan(role, ["marketplace_listing"]);
  const catalogState: "eligible" | "pending" | "approved" | "incomplete" | null = !canManageCatalog
    ? null
    : item.inCatalog
      ? item.catalogApproval?.status === "pending"
        ? "pending"
        : "approved"
      : item.origin === "quotation"
        ? isMasterRecordComplete(item)
          ? "eligible"
          : "incomplete"
        : null;

  return (
    <AppShell
      activeHref={item.inCatalog ? "/catalog" : "/dashboard"}
      backHref={item.inCatalog ? "/catalog" : "/dashboard"}
      backLabel={item.inCatalog ? "Catalog" : "Dashboard"}
      eyebrow="Item detail"
      title={item.vendorSku || "Item"}
    >
      <div className="flex items-center gap-2.5 mb-6">
        <Pill tone={ITEM_STATUS_TONE[item.status as keyof typeof ITEM_STATUS_TONE]}>
          {ITEM_STATUS_LABEL[item.status as keyof typeof ITEM_STATUS_LABEL]}
        </Pill>
        {item.itemNumber && <span className="font-mono text-[0.82rem] text-ink-faint">{item.itemNumber}</span>}
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 items-start">
        <Card>
          <h2 className="text-[0.95rem] mb-3.5">Product</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-3.5">
            <DetailField label="Vendor" value={(item.vendorId as unknown as { name?: string } | null)?.name} />
            <DetailField label="Vendor SKU" value={item.vendorSku} />
            <DetailField label="Base SKU" value={item.baseSku} />
            <DetailField label="Variant suffix" value={item.variantSuffix} />
            <DetailField label="Sample SKU" value={item.sampleSku} />
            <DetailField label="Permanent item #" value={item.itemNumber} />
            <DetailField label="Category" value={item.category} />
            <DetailField label="Brand" value={item.brand} />
            <DetailField label="Metal" value={item.specs?.metal} />
            <DetailField label="Plating" value={item.specs?.plating} />
            <DetailField label="UPC" value={item.upc} />
            <DetailField label="Gender" value={item.specs?.gender} />
            <DetailField label="Collection" value={item.collectionName} />
            <DetailField label="Season" value={item.season} />
            <DetailField label="Box number" value={item.boxNumber} />
          </div>
          <div className="grid grid-cols-1 gap-3.5 mt-3.5">
            <DetailField label="Title" value={item.title} />
            <DetailField label="Title #2" value={item.title2} />
            <DetailField label="Description" value={item.description} />
            <DetailField label="Description #2" value={item.description2} />
            <DetailField
              label="Feature points"
              value={
                item.bulletFeatures && item.bulletFeatures.length > 0 ? (
                  <ul className="m-0 pl-4">
                    {item.bulletFeatures.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                ) : null
              }
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-[0.95rem] mb-3.5">Purchase orders</h2>
          {purchaseOrders.length === 0 ? (
            <p className="text-ink-faint text-[0.85rem] m-0">None yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {purchaseOrders.map((po) => (
                <a
                  key={String(po._id)}
                  href={`/purchase-orders/${po._id}`}
                  className="flex items-center justify-between px-2.5 py-2 rounded-sm bg-surface-sunken no-underline"
                >
                  <span className="font-mono text-[0.82rem] font-semibold text-ink">{po.poNumber}</span>
                  <Pill tone={PO_STATUS_TONE[po.status as keyof typeof PO_STATUS_TONE]}>
                    {PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL]}
                  </Pill>
                </a>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 items-start mt-5">
        <ItemDetailSection title="Pricing" defaultOpen>
          <DetailField label="Latest cost / unit" value={fmtMoney(latestPricing?.costPerUnit, latestPricing?.currency)} />
          <DetailField label="Latest MSRP" value={fmtMoney(latestPricing?.msrp, latestPricing?.currency)} />
          <DetailField label="Latest Rue price" value={fmtMoney(latestPricing?.ruePrice, latestPricing?.currency)} />
          <DetailField label="Effective date" value={fmtDate(latestPricing?.effectiveDate)} />
          {item.pricingHistory && item.pricingHistory.length > 1 && (
            <div className="col-span-full mt-2">
              <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                Full pricing history ({item.pricingHistory.length} entries)
              </span>
              <div className="flex flex-col gap-1.5 mt-2">
                {[...item.pricingHistory].reverse().map((p, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.82rem] px-2.5 py-2 rounded-sm bg-surface-sunken">
                    <span className="text-ink-faint font-mono w-[92px] shrink-0">{fmtDate(p.effectiveDate)}</span>
                    <span>cost {fmtMoney(p.costPerUnit, p.currency)}</span>
                    <span>msrp {fmtMoney(p.msrp, p.currency)}</span>
                    <span>rue {fmtMoney(p.ruePrice, p.currency)}</span>
                    {p.source && <span className="text-ink-faint">({p.source})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ItemDetailSection>

        <ItemDetailSection title="Lifecycle & origin" defaultOpen>
          <DetailField
            label="Review decision"
            value={
              item.reviewDecision?.decision
                ? `${item.reviewDecision.decision}${item.reviewDecision.note ? ` — ${item.reviewDecision.note}` : ""}`
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
          <DetailField label="Monday.com item ID" value={item.mondayItemId} />
          <DetailField label="Created" value={fmtDate(item.createdAt)} />
          <DetailField label="Last updated" value={fmtDate(item.updatedAt)} />
        </ItemDetailSection>
      </div>

      <div className="grid grid-cols-2 gap-5 mt-5">
        <ItemDetailSection title="Variation info" hint="from the Master File's variation SKU/title/description columns">
          <DetailField label="Variation SKU" value={specs.variationSku as string | undefined} />
          <DetailField label="Variation title" value={specs.variationTitle as string | undefined} />
          <DetailField label="Variation description" value={specs.variationDescription as string | undefined} />
        </ItemDetailSection>

        <ItemDetailSection title="Measurements & findings">
          <DetailField label="Length + extender" value={specs.lengthExtender as string | undefined} />
          <DetailField label="Measurements" value={specs.measurements as string | undefined} />
          <DetailField label="Clasp" value={item.specs?.clasp} />
          <DetailField label="Length of post" value={specs.postLength as string | undefined} />
          <DetailField label="Push back size" value={specs.pushBackSize as string | undefined} />
          <DetailField label="Thickness of chain" value={item.specs?.thickness} />
          <DetailField label="All specs" value={specs.allSpecs as string | undefined} />
        </ItemDetailSection>
      </div>

      <div className="mt-5">
        <ItemDetailSection title="Weight & stones">
          <DetailField label="Total weight" value={item.specs?.weight?.totalG} />
          <DetailField label="Silver weight" value={item.specs?.weight?.silverG} />
          <DetailField label="Ring size" value={item.specs?.ringSize} />
          <DetailField label="Chain length" value={item.specs?.chainLength} />
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
      </div>

      {item.costHistory && item.costHistory.length > 0 && (
        <div className="mt-5">
          <ItemDetailSection title="Cost history" hint="per-PO costing snapshots">
            <div className="col-span-full flex flex-col gap-1.5">
              {[...item.costHistory].reverse().map((c, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.82rem] px-2.5 py-2 rounded-sm bg-surface-sunken">
                  <span className="text-ink-faint font-mono w-[92px] shrink-0">{fmtDate(c.recordedAt)}</span>
                  <span>labor/g {c.laborCostPerGram ?? "—"}</span>
                  <span>material/g {c.materialCostPerGram ?? "—"}</span>
                  <span>qty {c.qty ?? "—"}</span>
                  <span>total {c.total ?? "—"}</span>
                </div>
              ))}
            </div>
          </ItemDetailSection>
        </div>
      )}

      {item.customFields && Object.keys(item.customFields).length > 0 && (
        <div className="mt-5">
          <ItemDetailSection title="Custom fields" hint="unrecognized columns carried from a vendor quote">
            {Object.entries(item.customFields as unknown as Record<string, string>).map(([label, value]) => (
              <DetailField key={label} label={label} value={value} />
            ))}
          </ItemDetailSection>
        </div>
      )}

      <div className="mt-5">
        <MediaUpload
          itemId={String(item._id)}
          folderKey={item.itemNumber || item.sampleSku || null}
          canUpload={canUploadMedia}
          initialMedia={(item.media ?? []).map((m) => ({
            sharePointItemId: m.sharePointItemId,
            url: m.url,
            subfolder: m.subfolder as "main" | "sides" | "models",
          }))}
          initialCompleteness={{
            main: !!item.imageCompleteness?.main,
            sides: !!item.imageCompleteness?.sides,
            models: !!item.imageCompleteness?.models,
          }}
        />
      </div>

      {catalogState && (
        <div className="mt-5">
          <SubmitToCatalog itemId={String(item._id)} state={catalogState} />
        </div>
      )}

      {canEditItem && (
        <div className="mt-5">
          <ItemActions
            itemId={String(item._id)}
            vendorId={String(item.vendorId && typeof item.vendorId === "object" ? (item.vendorId as { _id: unknown })._id : item.vendorId)}
            status={item.status}
            hasReviewDecision={!!item.reviewDecision?.decision}
            hasSampleSku={!!item.sampleSku}
          />
        </div>
      )}
    </AppShell>
  );
}
