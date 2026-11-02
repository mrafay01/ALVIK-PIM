import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { getSharePointContext, checkDriveItemsExist } from "@/lib/sharepoint/client";
import { imageCompletenessOf } from "@/lib/items/images";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import logger from "@/lib/logger";

export const maxDuration = 60;

const BodySchema = z.object({
  // Check these items now (the "Check" button on one row / one page)...
  itemIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).optional(),
});

// Links checked within this window are skipped by "Check all".
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;

function dueFilter() {
  const cutoff = new Date(Date.now() - RECHECK_AFTER_MS);
  return {
    media: { $elemMatch: { $or: [{ linkCheckedAt: { $exists: false } }, { linkCheckedAt: { $lt: cutoff } }] } },
  };
}

// POST: verify that each image an item links to still exists in SharePoint,
// record the result on the image (ok / broken) and recompute the item's
// image completeness, so a deleted photo stops counting as uploaded.
// With itemIds, checks those items; without, checks the next items not
// checked in the last 24 hours for ~40 seconds and reports how many remain
// (the Images page keeps calling until none do).
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error);

  await connectDB();
  const deadline = Date.now() + 40_000;
  let ctx;
  try {
    ctx = await getSharePointContext();
  } catch (err) {
    logger.error("image check: SharePoint connection failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Couldn't connect to SharePoint. Try again in a moment." }, { status: 502 });
  }

  let checkedItems = 0;
  let checkedFiles = 0;
  let broken = 0;
  const explicit = parsed.data.itemIds;

  do {
    const items = await Item.find(explicit ? { _id: { $in: explicit } } : dueFilter())
      .select("media.sharePointItemId")
      .sort({ updatedAt: -1 })
      .limit(explicit ? 100 : 25)
      .lean();
    if (items.length === 0) break;

    const filesBefore = checkedFiles;
    const ids = [...new Set(items.flatMap((it) => it.media.map((m) => m.sharePointItemId)))];
    const exists = await checkDriveItemsExist(ctx, ids);
    const now = new Date();

    for (const it of items) {
      // Each image's result is written in place by its SharePoint id, never
      // by saving the whole image list back: an image uploaded while this
      // check was waiting on SharePoint would otherwise be wiped off the item.
      // A status check isn't an edit, so updatedAt is left alone.
      const ops = (it.media ?? []).flatMap((m) => {
        const ok = exists.get(m.sharePointItemId);
        if (ok === undefined) return []; // check itself failed; try again later
        checkedFiles++;
        if (!ok) broken++;
        return [
          {
            updateOne: {
              filter: { _id: it._id },
              update: { $set: { "media.$[m].linkStatus": ok ? "ok" : "broken", "media.$[m].linkCheckedAt": now } },
              arrayFilters: [{ "m.sharePointItemId": m.sharePointItemId }],
              timestamps: false,
            },
          },
        ];
      });
      if (ops.length === 0) continue;
      await Item.bulkWrite(ops as never, { ordered: false });

      // Completeness from the item as it is now, including any new upload.
      const fresh = await Item.findById(it._id)
        .select("itemNumber category specs pricingHistory media imageCompleteness")
        .lean();
      if (fresh) {
        const imageCompleteness = imageCompletenessOf(fresh.media ?? []);
        await Item.updateOne(
          { _id: it._id },
          { $set: { imageCompleteness, masterRecordComplete: isMasterRecordComplete({ ...fresh, imageCompleteness }) } },
          { timestamps: false }
        );
      }
      checkedItems++;
    }
    // Nothing could be checked this round (SharePoint not answering):
    // stop instead of re-asking about the same items until the deadline.
    if (explicit || checkedFiles === filesBefore) break;
  } while (Date.now() < deadline);

  const remaining = await Item.countDocuments(dueFilter());
  return NextResponse.json({ checkedItems, checkedFiles, broken, remaining });
}
