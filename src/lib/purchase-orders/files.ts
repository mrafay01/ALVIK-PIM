import crypto from "crypto";
import { Types } from "mongoose";
import PurchaseOrder from "@/models/PurchaseOrder";
import Quotation from "@/models/Quotation";
import { mondayRequest } from "@/lib/monday/client";
import {
  getSharePointContext,
  ensureFolderPath,
  moveDriveItem,
  uploadFile,
  relativeFolderPath,
  type DriveItem,
  type SharePointContext,
} from "@/lib/sharepoint/client";
import logger from "@/lib/logger";

// Every PO document, whether uploaded with a vendor quote or copied from the
// Monday board, lives in SharePoint under one folder per PO:
//
//   Purchase Orders/
//     22906/            <- PO number
//       PI-22906.xlsx
//     _Unassigned/      <- uploads whose PO number isn't known yet
//
// The root folder sits in the same document library as Images/ and can be
// renamed with SHAREPOINT_PO_FOLDER.

export const PO_FILES_ROOT = process.env.SHAREPOINT_PO_FOLDER?.trim() || "Purchase Orders";
export const UNASSIGNED_FOLDER = "_Unassigned";
// Largest quote/PI workbook accepted for upload.
export const MAX_QUOTE_FILE_BYTES = 30 * 1024 * 1024;

// SharePoint rejects " * : < > ? / \ | in names and trailing dots/spaces.
export function safeSharePointName(name: string): string {
  const cleaned = name
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned.slice(0, 200) || "file";
}

export function poFolder(poNumber: string): string[] {
  return [PO_FILES_ROOT, safeSharePointName(poNumber)];
}

export function unassignedFolder(): string[] {
  return [PO_FILES_ROOT, UNASSIGNED_FOLDER];
}

// ---------------------------------------------------------------------------
// Upload tickets.
//
// The browser uploads a quote file straight to SharePoint, then tells the
// server which file it uploaded. The ticket (signed with NEXTAUTH_SECRET)
// proves the server itself started that upload, for that user, into that
// folder, recently, so a caller can't point the importer at an arbitrary
// SharePoint file.

type TicketBody = { u: string; f: string; n: string; e: number };

function ticketKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return secret;
}

export function signUploadTicket(userId: string, folder: string[], fileName: string): string {
  const body: TicketBody = { u: userId, f: folder.join("/"), n: fileName, e: Date.now() + 6 * 60 * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUploadTicket(ticket: unknown, userId: string): TicketBody | null {
  if (typeof ticket !== "string" || ticket.length > 2000) return null;
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", ticketKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TicketBody;
    if (body.u !== userId || body.e < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

// Does this uploaded drive item belong to the ticket? It must sit in the
// ticket's folder, and its name must be the requested one (or SharePoint's
// "name 1.ext" rename of it when that name was taken).
export function itemMatchesTicket(item: DriveItem, ticket: TicketBody): boolean {
  if (relativeFolderPath(item) !== ticket.f) return false;
  const dot = ticket.n.lastIndexOf(".");
  const stem = dot > 0 ? ticket.n.slice(0, dot) : ticket.n;
  const ext = dot > 0 ? ticket.n.slice(dot) : "";
  return item.name === ticket.n || (item.name.startsWith(stem) && item.name.endsWith(ext));
}

// ---------------------------------------------------------------------------
// Uploaded quote files.

type SourceFile = { driveItemId: string; name: string; size?: number | null; webUrl: string; folder?: string | null };

function sourceFileFrom(item: DriveItem): SourceFile {
  return {
    driveItemId: item.id,
    name: item.name,
    size: item.size ?? null,
    webUrl: item.webUrl,
    folder: relativeFolderPath(item),
  };
}

// Moves a quote's uploaded file into "Purchase Orders/{poNumber}" if it
// isn't there already, and records the new location on the quote.
export async function fileQuotationIntoPoFolder(
  quotationId: Types.ObjectId | string,
  poNumber: string,
  ctx?: SharePointContext
): Promise<SourceFile | null> {
  const q = await Quotation.findById(quotationId).select("sourceFile").lean();
  const current = q?.sourceFile as SourceFile | null | undefined;
  if (!current) return null;
  const folder = poFolder(poNumber);
  if (current.folder === folder.join("/")) return current;

  const sp = ctx ?? (await getSharePointContext());
  const moved = sourceFileFrom(await moveDriveItem(sp, current.driveItemId, folder));
  await Quotation.updateOne({ _id: quotationId }, { $set: { sourceFile: moved } }, { timestamps: false });
  return moved;
}

// Called once a quote is attached to its PO (quote commit): moves the file
// into the PO's folder and lists it on the PO. Safe to call repeatedly.
export async function linkQuotationFileToPo(quotationId: Types.ObjectId, poId: Types.ObjectId): Promise<void> {
  const po = await PurchaseOrder.findById(poId).select("poNumber sharePointFiles sharePointFolderUrl").lean();
  if (!po) return;
  const ctx = await getSharePointContext();
  const file = await fileQuotationIntoPoFolder(quotationId, po.poNumber, ctx);
  if (!file) return;

  const folderUrl = po.sharePointFolderUrl ?? (await ensureFolderPath(ctx, poFolder(po.poNumber))).webUrl;
  const listed = (po.sharePointFiles ?? []).some((f) => String(f.quotationId) === String(quotationId));
  await PurchaseOrder.updateOne(
    { _id: poId },
    {
      $set: { sharePointFolderUrl: folderUrl },
      ...(listed
        ? {}
        : {
            $push: {
              sharePointFiles: {
                source: "upload",
                name: file.name,
                driveItemId: file.driveItemId,
                webUrl: file.webUrl,
                size: file.size ?? undefined,
                quotationId,
                addedAt: new Date(),
              },
            },
          }),
    },
    // Not a change to push back to Monday — leave updatedAt alone so the
    // bulk sync doesn't treat this PO as modified.
    { timestamps: false }
  );
}

// ---------------------------------------------------------------------------
// Monday -> SharePoint copy.
//
// The Monday pull records each PO's files (name + asset id) but the files
// themselves live on Monday. This copies every not-yet-copied file into the
// PO's SharePoint folder, newest POs first, a batch at a time, so it can run
// after each pull from the admin screen or from the background job worker
// without hitting a serverless time limit. A file that fails 3 times, or no
// longer exists on Monday, is skipped from then on (and reported).

const MAX_ATTEMPTS = 3;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

// POs with at least one Monday file that isn't copied and isn't given up on.
export const PENDING_FILTER = {
  "mondayFiles.0": { $exists: true },
  $expr: {
    $gt: [
      {
        $size: {
          $setDifference: [
            "$mondayFiles.assetId",
            {
              $concatArrays: [
                { $ifNull: ["$sharePointFiles.mondayAssetId", []] },
                { $ifNull: ["$archiveGaveUp", []] },
              ],
            },
          ],
        },
      },
      0,
    ],
  },
};

export async function countPendingMondayFiles(): Promise<{ pos: number; files: number }> {
  const [row] = await PurchaseOrder.aggregate<{ pos: number; files: number }>([
    { $match: PENDING_FILTER },
    {
      $project: {
        n: {
          $size: {
            $setDifference: [
              "$mondayFiles.assetId",
              {
                $concatArrays: [
                  { $ifNull: ["$sharePointFiles.mondayAssetId", []] },
                  { $ifNull: ["$archiveGaveUp", []] },
                ],
              },
            ],
          },
        },
      },
    },
    { $group: { _id: null, pos: { $sum: 1 }, files: { $sum: "$n" } } },
  ]);
  return { pos: row?.pos ?? 0, files: row?.files ?? 0 };
}

type ArchiveResult = { copied: number; failed: number; skipped: number; remaining: { pos: number; files: number } };

export async function archiveMondayFiles(opts: { timeBudgetMs: number }): Promise<ArchiveResult> {
  const deadline = Date.now() + opts.timeBudgetMs;
  const result = { copied: 0, failed: 0, skipped: 0 };
  let ctx: SharePointContext | null = null;
  // A PO with a failed copy waits for the next run rather than being
  // retried straight away in this one.
  const failedThisRun: Types.ObjectId[] = [];

  while (Date.now() < deadline) {
    const batch = await PurchaseOrder.find({ ...PENDING_FILTER, _id: { $nin: failedThisRun } })
      .select("poNumber mondayFiles sharePointFiles sharePointFolderUrl archiveErrors archiveGaveUp")
      .sort({ orderDate: -1, createdAt: -1 })
      .limit(10)
      .lean();
    if (batch.length === 0) break;

    ctx ??= await getSharePointContext();
    const todo = batch.flatMap((po) => {
      const done = new Set([
        ...(po.sharePointFiles ?? []).map((f) => f.mondayAssetId).filter(Boolean),
        ...(po.archiveGaveUp ?? []),
      ]);
      return (po.mondayFiles ?? []).filter((f) => !done.has(f.assetId)).map((f) => ({ po, file: f }));
    });

    // One Monday call resolves fresh download links for the whole batch.
    const assets = await mondayRequest<{ assets: { id: string; name: string; public_url: string | null }[] }>(
      `query ($ids: [ID!]!) { assets(ids: $ids) { id name public_url } }`,
      { ids: todo.map((t) => t.file.assetId) }
    );
    const urlById = new Map(assets.assets.map((a) => [String(a.id), a.public_url]));

    for (const { po, file } of todo) {
      if (Date.now() >= deadline) break;
      const url = urlById.get(file.assetId);
      if (!url) {
        await giveUp(po._id, file.assetId, "File no longer exists on Monday");
        result.skipped++;
        continue;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Monday download failed (${res.status})`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_FILE_BYTES) throw new Error("File is larger than 200 MB");

        const folder = poFolder(po.poNumber);
        const item = await uploadFile(ctx, folder, safeSharePointName(file.name), buf);
        const folderUrl = po.sharePointFolderUrl ?? (await ensureFolderPath(ctx, folder)).webUrl;
        await PurchaseOrder.updateOne(
          { _id: po._id },
          {
            $set: { sharePointFolderUrl: folderUrl },
            $push: {
              sharePointFiles: {
                source: "monday",
                name: item.name,
                driveItemId: item.id,
                webUrl: item.webUrl,
                size: item.size ?? buf.byteLength,
                mondayAssetId: file.assetId,
                addedAt: new Date(),
              },
            },
            $pull: { archiveErrors: { assetId: file.assetId } },
          },
          { timestamps: false }
        );
        result.copied++;
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : String(err);
        const prev = (po.archiveErrors ?? []).find((e) => e.assetId === file.assetId)?.attempts ?? 0;
        logger.warn("PO file copy to SharePoint failed", { poNumber: po.poNumber, assetId: file.assetId, message });
        if (prev + 1 >= MAX_ATTEMPTS) {
          await giveUp(po._id, file.assetId, message, prev + 1);
        } else {
          await PurchaseOrder.updateOne(
            { _id: po._id },
            { $pull: { archiveErrors: { assetId: file.assetId } } },
            { timestamps: false }
          );
          await PurchaseOrder.updateOne(
            { _id: po._id },
            { $push: { archiveErrors: { assetId: file.assetId, message, attempts: prev + 1, at: new Date() } } },
            { timestamps: false }
          );
        }
        failedThisRun.push(po._id);
        result.failed++;
      }
    }
  }

  return { ...result, remaining: await countPendingMondayFiles() };
}

async function giveUp(poId: Types.ObjectId, assetId: string, message: string, attempts = 1) {
  await PurchaseOrder.updateOne(
    { _id: poId },
    { $addToSet: { archiveGaveUp: assetId }, $pull: { archiveErrors: { assetId } } },
    { timestamps: false }
  );
  await PurchaseOrder.updateOne(
    { _id: poId },
    { $push: { archiveErrors: { assetId, message, attempts, at: new Date() } } },
    { timestamps: false }
  );
}
