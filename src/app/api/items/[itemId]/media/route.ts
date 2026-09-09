import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { getSharePointContext, ensureItemFolders, uploadItemImage } from "@/lib/sharepoint/client";

// POST: upload one or more images for an item, routed to Main/Sides/Models
// by filename suffix (§Image Storage). The folder is keyed by sampleSku
// until a permanent itemNumber exists, per the blueprint — images can be
// uploaded at any lifecycle stage. imageCompleteness and the master-record
// gate are recomputed right after, same as the items PATCH route.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  await connectDB();

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const folderKey = item.itemNumber || item.sampleSku;
  if (!folderKey) {
    return NextResponse.json(
      { error: "Item has neither a sample SKU nor a permanent item number yet" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await getSharePointContext();
    await ensureItemFolders(ctx, folderKey);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SharePoint connection failed" },
      { status: 502 }
    );
  }

  const uploaded: { filename: string; subfolder: string; url: string }[] = [];
  const failed: { filename: string; error: string }[] = [];

  for (const file of files) {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await uploadItemImage(ctx, folderKey, file.name, bytes);
      item.media.push({
        sharePointItemId: result.sharePointItemId,
        url: result.url,
        subfolder: result.subfolder,
        uploadedBy: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
        uploadedAt: new Date(),
      });
      uploaded.push({ filename: file.name, subfolder: result.subfolder, url: result.url });
    } catch (err) {
      failed.push({ filename: file.name, error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  if (!item.sharePointFolderPath) {
    item.sharePointFolderPath = `/Images/${folderKey}/`;
  }

  const subfoldersPresent = new Set(item.media.map((m) => m.subfolder));
  item.imageCompleteness = {
    main: subfoldersPresent.has("main"),
    sides: subfoldersPresent.has("sides"),
    models: subfoldersPresent.has("models"),
  };
  item.masterRecordComplete = isMasterRecordComplete(item);

  await item.save();

  return NextResponse.json({ uploaded, failed, imageCompleteness: item.imageCompleteness });
}
