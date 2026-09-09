import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { MARKETPLACE_EXPORT_PLATFORMS } from "@/lib/enums";
import { MarketplaceListingPatchSchema, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import MarketplaceListing from "@/models/MarketplaceListing";

function isExportPlatform(p: string): p is (typeof MARKETPLACE_EXPORT_PLATFORMS)[number] {
  return (MARKETPLACE_EXPORT_PLATFORMS as readonly string[]).includes(p);
}

// PATCH: create-or-update the (item, platform) listing overlay used by the
// export review screen. Upsert rather than requiring a separate create
// step — a reviewer just starts typing into a blank row and the first edit
// creates the listing document.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string; itemId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.marketplaceExport);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { platform, itemId } = await params;
  if (!isExportPlatform(platform)) {
    return NextResponse.json({ error: `No export template for platform "${platform}"` }, { status: 404 });
  }

  const parsed = MarketplaceListingPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { bulletFeatures, ...rest } = parsed.data;

  await connectDB();

  const item = await Item.findById(itemId).select("_id").lean();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const update: Record<string, unknown> = { ...rest, updatedBy: session.user?.id ?? null };
  if (bulletFeatures) {
    update.bulletFeatures = bulletFeatures.map((text) => ({ text }));
  }

  const listing = await MarketplaceListing.findOneAndUpdate(
    { itemId, platform },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ listing });
}
