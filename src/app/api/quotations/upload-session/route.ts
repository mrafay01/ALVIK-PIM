import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import {
  getSharePointContext,
  ensureFolderPath,
  createUploadSession,
  getDriveItem,
  deleteDriveItem,
} from "@/lib/sharepoint/client";
import {
  poFolder,
  unassignedFolder,
  safeSharePointName,
  signUploadTicket,
  verifyUploadTicket,
  itemMatchesTicket,
  MAX_QUOTE_FILE_BYTES,
} from "@/lib/purchase-orders/files";
import { poNumberFromFileName } from "@/lib/purchase-orders/poNumber";
import logger from "@/lib/logger";

// Quote files go from the browser straight to SharePoint, never through
// this server: hosting platforms cap request bodies (4.5 MB on Vercel),
// and vendor PI workbooks run to 15 MB+. This route only opens the upload
// and hands back a signed ticket the import call later presents.

const StartSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/\.(xlsx|xls|csv)$/i, "Upload an .xlsx, .xls or .csv file"),
  size: z.number().int().positive(),
});

// POST: start an upload. The PO number is the file's name ("22906.xlsx" ->
// "PO-22906"), so the file lands straight in "Purchase Orders/PO-22906".
// Only a name with nothing before the extension goes to _Unassigned.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.quotes);
  if (isAuthFail(gate)) return gate.response;
  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { fileName, size } = parsed.data;
  if (size > MAX_QUOTE_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. The limit is ${MAX_QUOTE_FILE_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    );
  }

  const name = safeSharePointName(fileName);
  const po = poNumberFromFileName(name);
  const folder = po ? poFolder(po) : unassignedFolder();

  try {
    const ctx = await getSharePointContext();
    await ensureFolderPath(ctx, folder);
    const session = await createUploadSession(ctx, folder, name);
    return NextResponse.json({
      uploadUrl: session.uploadUrl,
      ticket: signUploadTicket(userId, folder, name),
    });
  } catch (err) {
    logger.error("quote upload: starting SharePoint upload failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Couldn't start the upload to SharePoint. Try again in a moment." },
      { status: 502 }
    );
  }
}

const DiscardSchema = z.object({ ticket: z.string(), driveItemId: z.string().min(1).max(200) });

// DELETE: discard a file uploaded with a ticket that never became a quote
// (the user cancelled at the sheet picker). Goes to the site's recycle bin.
export async function DELETE(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.quotes);
  if (isAuthFail(gate)) return gate.response;
  const userId = gate.session.user?.id ?? "";

  const parsed = DiscardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const ticket = verifyUploadTicket(parsed.data.ticket, userId);
  if (!ticket) return NextResponse.json({ error: "Upload expired" }, { status: 400 });

  try {
    const ctx = await getSharePointContext();
    const item = await getDriveItem(ctx, parsed.data.driveItemId);
    if (!itemMatchesTicket(item, ticket)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await deleteDriveItem(ctx, item.id);
  } catch (err) {
    logger.warn("quote upload: discarding file failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return NextResponse.json({ discarded: true });
}
