import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { isObjectId } from "@/lib/ids";
import { getSharePointContext, getDriveItem } from "@/lib/sharepoint/client";
import { verifyUploadTicket, itemMatchesTicket } from "@/lib/purchase-orders/files";
import { imageCompletenessOf } from "@/lib/items/images";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import type { ImageSubfolder } from "@/lib/enums";

const BodySchema = z.object({ ticket: z.string().max(2000), driveItemId: z.string().min(1).max(200) });
const KIND_FOR: Record<string, ImageSubfolder> = { Main: "main", Sides: "sides", Models: "models", Lifestyle: "lifestyle" };

// POST: record an image the browser just uploaded to SharePoint (see
// ./upload-session) on the item, and recompute image completeness.
export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const gate = await requireRole(ROLE_SETS.media);
  if (isAuthFail(gate)) return gate.response;
  const userId = gate.session.user?.id ?? "";

  const { itemId } = await params;
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const ticket = verifyUploadTicket(parsed.data.ticket, userId);
  if (!ticket) return NextResponse.json({ error: "The upload has expired. Try again." }, { status: 400 });

  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const key = item.itemNumber || item.sampleSku;
  // The ticket must be for one of this item's own image folders.
  const [root, ticketKey, sub] = ticket.f.split("/");
  const kind = KIND_FOR[sub];
  if (root !== "Images" || ticketKey !== key || !kind) {
    return NextResponse.json({ error: "That upload belongs to a different item" }, { status: 400 });
  }

  const driveItem = await getDriveItem(await getSharePointContext(), parsed.data.driveItemId).catch(() => null);
  if (!driveItem || !itemMatchesTicket(driveItem, ticket)) {
    return NextResponse.json({ error: "Uploaded file not found in SharePoint. Try again." }, { status: 400 });
  }

  const existing = item.media.findIndex((m) => m.sharePointItemId === driveItem.id);
  if (existing !== -1) item.media.splice(existing, 1);
  item.media.push({
    sharePointItemId: driveItem.id,
    url: driveItem.webUrl,
    name: driveItem.name,
    subfolder: kind,
    uploadedBy: userId ? new Types.ObjectId(userId) : undefined,
    uploadedAt: new Date(),
    linkStatus: "ok",
    linkCheckedAt: new Date(),
  });
  if (!item.sharePointFolderPath) item.sharePointFolderPath = `/Images/${key}/`;
  item.imageCompleteness = imageCompletenessOf(item.media);
  item.masterRecordComplete = isMasterRecordComplete(item);
  if (userId) item.lastEditedBy = new Types.ObjectId(userId);
  await item.save();

  return NextResponse.json({
    imageCompleteness: item.imageCompleteness,
    media: item.media.map((m) => ({
      sharePointItemId: m.sharePointItemId,
      url: m.url,
      name: m.name ?? null,
      subfolder: m.subfolder,
      linkStatus: m.linkStatus ?? null,
    })),
  });
}
