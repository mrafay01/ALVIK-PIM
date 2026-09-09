import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { MARKETPLACE_EXPORT_PLATFORMS } from "@/lib/enums";
import Item from "@/models/Item";
import MarketplaceListing from "@/models/MarketplaceListing";
import SyncLog from "@/models/SyncLog";
import { resolveListingFields } from "@/lib/marketplace-export/resolveListing";
import { MACYS_COLUMNS, mapItemToMacysRow } from "@/lib/marketplace-export/macys";
import { TARGET_COLUMNS, mapItemToTargetRow } from "@/lib/marketplace-export/target";
import { BELK_COLUMNS, mapItemToBelkRow } from "@/lib/marketplace-export/belk";
import { KOHLS_FULL_COLUMNS, mapItemToKohlsRow } from "@/lib/marketplace-export/kohls";
import { buildCsv } from "@/lib/marketplace-export/writeCsv";
import { buildTwoHeaderRowXlsx, buildSingleHeaderRowXlsx } from "@/lib/marketplace-export/writeXlsx";

function isExportPlatform(p: string): p is (typeof MARKETPLACE_EXPORT_PLATFORMS)[number] {
  return (MARKETPLACE_EXPORT_PLATFORMS as readonly string[]).includes(p);
}

const MAX_EXPORT_ITEMS = 5000;

// POST: build the exact-format bulk-import file for one platform from the
// selected items' current Item + MarketplaceListing data, and return it as
// a download. Nothing is sent to the marketplace itself — this app never
// talks to Target/Macy's/Belk/Kohl's APIs; it only produces the file a
// human uploads there by hand, after reviewing it in the app.
export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const gate = await requireRole(ROLE_SETS.marketplaceExport);
  if (isAuthFail(gate)) return gate.response;

  const { platform } = await params;
  if (!isExportPlatform(platform)) {
    return NextResponse.json({ error: `No export template for platform "${platform}"` }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const itemIds = body?.itemIds;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: "itemIds must be a non-empty array" }, { status: 400 });
  }
  if (itemIds.length > MAX_EXPORT_ITEMS) {
    return NextResponse.json(
      { error: `Too many items selected (${itemIds.length}) — the limit per export is ${MAX_EXPORT_ITEMS}.` },
      { status: 413 }
    );
  }
  if (!itemIds.every((id) => typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id))) {
    return NextResponse.json({ error: "itemIds must be Mongo ObjectId strings" }, { status: 400 });
  }

  await connectDB();
  const startedAt = new Date();

  const items = await Item.find({ _id: { $in: itemIds } })
    .select("itemNumber category specs pricingHistory")
    .lean();
  const listings = await MarketplaceListing.find({ platform, itemId: { $in: itemIds } }).lean();
  const listingByItemId = new Map(listings.map((l) => [String(l.itemId), l]));

  const skippedNoSku: string[] = [];
  const resolvedRows = items
    .map((item) => {
      if (!item.itemNumber) {
        skippedNoSku.push(String(item._id));
        return null;
      }
      const listing = listingByItemId.get(String(item._id));
      return resolveListingFields(item, listing);
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let fileBuffer: Buffer;
  let filename: string;
  let contentType: string;

  const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const dateStamp = startedAt.toISOString().slice(0, 10);

  if (platform === "macys") {
    const rows = resolvedRows.map(mapItemToMacysRow);
    fileBuffer = await buildTwoHeaderRowXlsx(MACYS_COLUMNS, rows);
    filename = `macys-import-${dateStamp}.xlsx`;
    contentType = XLSX_CONTENT_TYPE;
  } else if (platform === "target") {
    // Target is the one CSV-only platform — every other export here is XLSX.
    const rows = resolvedRows.map(mapItemToTargetRow);
    const csv = buildCsv(TARGET_COLUMNS, rows);
    fileBuffer = Buffer.from(csv, "utf-8");
    filename = `target-import-${dateStamp}.csv`;
    contentType = "text/csv";
  } else if (platform === "belk") {
    const rows = resolvedRows.map(mapItemToBelkRow);
    fileBuffer = await buildSingleHeaderRowXlsx(BELK_COLUMNS, rows);
    filename = `belk-import-${dateStamp}.xlsx`;
    contentType = XLSX_CONTENT_TYPE;
  } else {
    // kohls
    const rows = resolvedRows.map(mapItemToKohlsRow);
    fileBuffer = await buildTwoHeaderRowXlsx(KOHLS_FULL_COLUMNS, rows);
    filename = `kohls-import-${dateStamp}.xlsx`;
    contentType = XLSX_CONTENT_TYPE;
  }

  await SyncLog.create({
    runType: "marketplace_export",
    startedAt,
    finishedAt: new Date(),
    rowsProcessed: items.length,
    changed: resolvedRows.length,
    unchanged: 0,
    skipped: skippedNoSku.length,
    errored: 0,
    errorDetail: skippedNoSku.map((itemId) => ({
      itemId,
      message: "Skipped — item has no itemNumber (SKU) yet",
    })),
  });

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
