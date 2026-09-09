import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/statusDisplay";
import { ItemActions } from "./ItemActions";
import { MediaUpload } from "./MediaUpload";

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

  return (
    <AppShell activeHref="/items" eyebrow="Item detail" title={item.vendorSku || "Item"}>
      <div className="flex items-center gap-2.5 mb-6">
        <Pill tone={ITEM_STATUS_TONE[item.status as keyof typeof ITEM_STATUS_TONE]}>
          {ITEM_STATUS_LABEL[item.status as keyof typeof ITEM_STATUS_LABEL]}
        </Pill>
        {item.itemNumber && <span className="font-mono text-[0.82rem] text-ink-faint">{item.itemNumber}</span>}
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 items-start">
        <Card>
          <h2 className="text-[0.95rem] mb-3.5">Details</h2>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2.5 m-0 text-[0.87rem]">
            <dt className="text-ink-faint">Vendor</dt>
            <dd className="m-0">{(item.vendorId as unknown as { name?: string } | null)?.name || "—"}</dd>
            <dt className="text-ink-faint">Category</dt>
            <dd className="m-0">{item.category || "—"}</dd>
            <dt className="text-ink-faint">Metal</dt>
            <dd className="m-0">{item.specs?.metal || "—"}</dd>
            <dt className="text-ink-faint">Sample SKU</dt>
            <dd className="m-0 font-mono">{item.sampleSku || "—"}</dd>
            <dt className="text-ink-faint">Review decision</dt>
            <dd className="m-0">
              {item.reviewDecision?.decision
                ? `${item.reviewDecision.decision}${item.reviewDecision.note ? ` — ${item.reviewDecision.note}` : ""}`
                : "pending"}
            </dd>
            <dt className="text-ink-faint">Latest pricing</dt>
            <dd className="m-0 font-mono">
              {latestPricing
                ? `cost ${latestPricing.costPerUnit ?? "—"} / msrp ${latestPricing.msrp ?? "—"}`
                : "—"}
            </dd>
          </dl>
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
