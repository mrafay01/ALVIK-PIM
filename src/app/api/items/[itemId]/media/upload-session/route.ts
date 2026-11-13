import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { isObjectId } from "@/lib/ids";
import { IMAGE_SUBFOLDERS } from "@/lib/enums";
import { getSharePointContext, ensureItemFolders, createUploadSession, inferSubfolder } from "@/lib/sharepoint/client";
import { safeSharePointName, signUploadTicket } from "@/lib/purchase-orders/files";
import { SUBFOLDER_FOR, conventionalImageName, extensionOf, mediaFileProblem } from "@/lib/items/images";
import logger from "@/lib/logger";

const BodySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  // "auto" keeps the file's own name and routes it by its suffix
  // ({key}.jpg / -S{n} / -M{n} / -LS{n} / -V{n}); the others rename it to the
  // convention. "videos" takes video files; every other kind images.
  kind: z.enum([...IMAGE_SUBFOLDERS, "auto"]),
});

// POST: start a browser -> SharePoint upload of one image or video clip for
// this item. Returns a pre-authenticated upload URL and a signed ticket for
// ./confirm. The bytes never pass through this server, so file size isn't
// limited by the hosting platform's request cap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const gate = await requireRole(ROLE_SETS.media);
  if (isAuthFail(gate)) return gate.response;
  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { fileName, size, kind } = parsed.data;

  const ext = extensionOf(fileName);
  // Checked before touching the database when the folder is already known;
  // "auto" is checked below, once the name has picked the folder.
  if (kind !== "auto") {
    const problem = mediaFileProblem(SUBFOLDER_FOR[kind], fileName, size);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  await connectDB();
  const item = await Item.findById(itemId).select("itemNumber sampleSku media").lean();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const key = item.itemNumber || item.sampleSku;
  if (!key) {
    return NextResponse.json({ error: "This item needs a sample SKU or item number before images can be added" }, { status: 400 });
  }

  let subfolder;
  let name: string;
  try {
    if (kind === "auto") {
      subfolder = inferSubfolder(key, fileName);
      const problem = mediaFileProblem(subfolder, fileName, size);
      if (problem) throw new Error(problem);
      name = safeSharePointName(fileName);
    } else {
      subfolder = SUBFOLDER_FOR[kind];
      name = conventionalImageName(key, kind, ext === ".jpeg" ? ".jpg" : ext, item.media ?? []);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const folder = ["Images", key, subfolder];
  try {
    const ctx = await getSharePointContext();
    await ensureItemFolders(ctx, key, subfolder);
    // Main (and an exact re-upload of a named file) replaces the old file;
    // a numbered side/model/lifestyle shot or video never overwrites another.
    const session = await createUploadSession(ctx, folder, name, kind === "main" || kind === "auto" ? "replace" : "rename");
    return NextResponse.json({ uploadUrl: session.uploadUrl, ticket: signUploadTicket(userId, folder, name), fileName: name });
  } catch (err) {
    logger.error("media upload: starting SharePoint upload failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Couldn't start the upload to SharePoint. Try again in a moment." }, { status: 502 });
  }
}
