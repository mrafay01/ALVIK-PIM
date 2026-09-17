import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { MARKETPLACE_EXPORT_PLATFORMS, ITEM_STATUSES } from "@/lib/enums";
import Item from "@/models/Item";
import MarketplaceListing from "@/models/MarketplaceListing";

function isExportPlatform(p: string): p is (typeof MARKETPLACE_EXPORT_PLATFORMS)[number] {
  return (MARKETPLACE_EXPORT_PLATFORMS as readonly string[]).includes(p);
}

// GET: items eligible for export on this platform, each paired with its
// existing MarketplaceListing overlay (if one has been started). This is
// the data source for the review screen — nothing is exported here, only
// assembled for a human to check and edit before generating a file.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const gate = await requireRole(ROLE_SETS.marketplaceExport);
  if (isAuthFail(gate)) return gate.response;

  const { platform } = await params;
  if (!isExportPlatform(platform)) {
    return NextResponse.json({ error: `No export template for platform "${platform}"` }, { status: 404 });
  }

  await connectDB();

  // Only items far enough along the pipeline to be worth listing — live
  // catalog items with a permanent SKU. Matches the statuses a marketplace
  // listing would realistically be built from.
  const exportableStatuses = ITEM_STATUSES.filter((s) =>
    ["sku_permanent", "po_sent", "receiving", "live"].includes(s)
  );

  // Inactive items are catalog-visible but never exportable — see
  // Item.active. Excluded at the source so they never reach the review
  // screen a listing would be built from.
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
    item,
    listing: listingByItemId.get(String(item._id)) ?? null,
  }));

  return NextResponse.json({ platform, rows });
}
