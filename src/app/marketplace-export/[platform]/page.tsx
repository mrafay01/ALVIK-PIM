import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { MARKETPLACE_EXPORT_PLATFORMS, ITEM_STATUSES } from "@/lib/enums";
import Item from "@/models/Item";
import MarketplaceListing from "@/models/MarketplaceListing";
import { ExportReviewTable } from "./ExportReviewTable";

const PLATFORM_NAMES: Record<string, string> = {
  macys: "Macy's",
  target: "Target",
  belk: "Belk",
  kohls: "Kohl's",
};

export default async function MarketplaceExportPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  if (!(MARKETPLACE_EXPORT_PLATFORMS as readonly string[]).includes(platform)) {
    notFound();
  }

  await connectDB();

  const exportableStatuses = ITEM_STATUSES.filter((s) =>
    ["sku_permanent", "po_sent", "receiving", "live"].includes(s)
  );
  // Same eligibility as GET /api/marketplace-export/[platform]/listings —
  // inactive items are never exportable, so they're not offered here either.
  const items = await Item.find({
    status: { $in: exportableStatuses },
    itemNumber: { $ne: null },
    active: { $ne: false },
  })
    .select("itemNumber category status specs pricingHistory")
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  const listings = await MarketplaceListing.find({
    platform,
    itemId: { $in: items.map((i) => i._id) },
  }).lean();
  const listingByItemId = new Map(listings.map((l) => [String(l.itemId), l]));

  const rows = items.map((item) => ({
    item: JSON.parse(JSON.stringify(item)),
    listing: JSON.parse(JSON.stringify(listingByItemId.get(String(item._id)) ?? null)),
  }));

  return (
    <AppShell
      activeHref="/marketplace-export"
      backHref="/marketplace-export"
      backLabel="Marketplace Export"
      eyebrow="Bulk-import file"
      title={`${PLATFORM_NAMES[platform] ?? platform} Export`}
    >
      <ExportReviewTable platform={platform} rows={rows} />
    </AppShell>
  );
}
