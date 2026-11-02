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
  listFolderFiles,
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
// How long one run may hold a PO before another run may take it over. Longer
// than the longest run (a ~60-second request), with room to spare.
export const ARCHIVE_LOCK_MS = 5 * 60 * 1000;
// Asset ids per Monday lookup.
const ASSET_LOOKUP_CHUNK = 50;
// Recorded before each download and replaced by the real outcome, so a run
// the platform kills mid-copy (too large / too slow) still counts as an attempt.
const UNFINISHED_MESSAGE = "The copy didn't finish (the file may be too large or too slow to download)";

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

export async function countPendingMondayFiles(poId?: Types.ObjectId): Promise<{ pos: number; files: number }> {
  const [row] = await PurchaseOrder.aggregate<{ pos: number; files: number }>([
    { $match: poId ? { ...PENDING_FILTER, _id: poId } : PENDING_FILTER },
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

export type ArchiveResult = { copied: number; failed: number; skipped: number; remaining: { pos: number; files: number } };

type MondayAsset = { id: string; public_url: string | null; file_size?: number | null };

// Fresh download links for these assets. An id missing from the answer no
// longer exists on Monday.
async function lookUpAssets(assetIds: string[]): Promise<Map<string, MondayAsset>> {
  const byId = new Map<string, MondayAsset>();
  for (let i = 0; i < assetIds.length; i += ASSET_LOOKUP_CHUNK) {
    const data = await mondayRequest<{ assets: MondayAsset[] }>(
      `query ($ids: [ID!]!) { assets(ids: $ids) { id public_url file_size } }`,
      { ids: assetIds.slice(i, i + ASSET_LOOKUP_CHUNK) }
    );
    for (const a of data.assets) byId.set(String(a.id), a);
  }
  return byId;
}

async function downloadMondayFile(url: string, timeoutMs: number): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Monday download failed (${res.status})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) throw new Error("File is larger than 200 MB");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error("File is larger than 200 MB");
  return buf;
}

// Copies Monday PO files into each PO's SharePoint folder until the time
// budget runs out: every PO with files left (newest first), or just `poId`.
// Each PO is claimed atomically for the duration, so overlapping runs never
// copy the same file twice, and a copy is recorded on the PO at most once.
export async function archiveMondayFiles(opts: { timeBudgetMs: number; poId?: Types.ObjectId }): Promise<ArchiveResult> {
  const deadline = Date.now() + opts.timeBudgetMs;
  const result = { copied: 0, failed: 0, skipped: 0 };
  let ctx: SharePointContext | null = null;
  // POs already worked on in this run: anything left on them (failures,
  // files cut off by the deadline) waits for the next run.
  const done: Types.ObjectId[] = [];

  while (Date.now() < deadline) {
    const claimedAt = new Date();
    const po = await PurchaseOrder.findOneAndUpdate(
      {
        ...PENDING_FILTER,
        _id: opts.poId ? { $eq: opts.poId, $nin: done } : { $nin: done },
        $or: [{ archiveLockedAt: null }, { archiveLockedAt: { $lt: new Date(claimedAt.getTime() - ARCHIVE_LOCK_MS) } }],
      },
      { $set: { archiveLockedAt: claimedAt } },
      {
        sort: { orderDate: -1, createdAt: -1 },
        new: true,
        timestamps: false,
        projection: "poNumber mondayFiles sharePointFiles sharePointFolderUrl archiveErrors archiveGaveUp",
      }
    ).lean<ArchivePo>();
    // Nothing left, or everything left is being copied by another run.
    if (!po) break;
    done.push(po._id);

    try {
      // Can't reach SharePoint at all: stop the run and report it.
      ctx ??= await getSharePointContext();
      await archiveOnePo(ctx, po, deadline, result);
    } catch (err) {
      if (!ctx) throw err;
      // One PO's lookup failed (Monday or SharePoint answered with an
      // error): move on so it can't hold up every other PO behind it.
      logger.warn("PO file copy: skipped a PO this run", {
        poNumber: po.poNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
    } finally {
      await PurchaseOrder.updateOne(
        { _id: po._id, archiveLockedAt: claimedAt },
        { $unset: { archiveLockedAt: "" } },
        { timestamps: false }
      );
    }
  }

  return { ...result, remaining: await countPendingMondayFiles(opts.poId) };
}

type ArchivePo = {
  _id: Types.ObjectId;
  poNumber: string;
  mondayFiles?: { name: string; assetId: string }[] | null;
  sharePointFiles?: { driveItemId: string; mondayAssetId?: string | null }[] | null;
  sharePointFolderUrl?: string | null;
  archiveErrors?: { assetId: string; attempts?: number | null }[] | null;
  archiveGaveUp?: string[] | null;
};

async function archiveOnePo(
  ctx: SharePointContext,
  po: ArchivePo,
  deadline: number,
  result: { copied: number; failed: number; skipped: number }
): Promise<void> {
  const settled = new Set([
    ...(po.sharePointFiles ?? []).map((f) => f.mondayAssetId).filter((id): id is string => !!id),
    ...(po.archiveGaveUp ?? []),
  ]);
  const seen = new Set<string>();
  const todo = (po.mondayFiles ?? []).filter((f) => {
    if (settled.has(f.assetId) || seen.has(f.assetId)) return false;
    seen.add(f.assetId);
    return true;
  });
  if (todo.length === 0) return;

  const folder = poFolder(po.poNumber);
  const assets = await lookUpAssets(todo.map((f) => f.assetId));
  // Files already in the folder that this PO doesn't list yet: what a run cut
  // off between uploading and recording left behind. Matched by name and
  // adopted instead of uploading a second copy. A vendor quote's uploaded PI
  // waiting in the folder (not committed yet) is never taken for one.
  const recorded = new Set((po.sharePointFiles ?? []).map((f) => f.driveItemId));
  const inFolder = (await listFolderFiles(ctx, folder)).filter((f) => !recorded.has(f.id));
  const quoteFiles = inFolder.length
    ? new Set(
        (
          await Quotation.find({ "sourceFile.driveItemId": { $in: inFolder.map((f) => f.id) } })
            .select("sourceFile.driveItemId")
            .lean()
        ).map((q) => q.sourceFile?.driveItemId)
      )
    : new Set<string | undefined>();
  const unrecorded = new Map(inFolder.filter((f) => !quoteFiles.has(f.id)).map((f) => [f.name, f] as const));
  let folderUrl = po.sharePointFolderUrl ?? null;

  for (const file of todo) {
    if (Date.now() >= deadline) break;
    const prevAttempts = (po.archiveErrors ?? []).find((e) => e.assetId === file.assetId)?.attempts ?? 0;
    const asset = assets.get(file.assetId);
    if (!asset) {
      await giveUp(po._id, file.assetId, "File no longer exists on Monday", prevAttempts);
      result.skipped++;
      continue;
    }
    // Earlier runs were cut off this many times without reporting back.
    if (prevAttempts >= MAX_ATTEMPTS) {
      await giveUp(po._id, file.assetId, UNFINISHED_MESSAGE, prevAttempts);
      result.failed++;
      continue;
    }

    const name = safeSharePointName(file.name);
    try {
      let item = unrecorded.get(name);
      if (item) {
        unrecorded.delete(name);
      } else {
        if (!asset.public_url) throw new Error("Monday didn't return a download link");
        await recordError(po._id, file.assetId, UNFINISHED_MESSAGE, prevAttempts + 1);
        // Leave room to upload what was downloaded before the request limit.
        const buf = await downloadMondayFile(asset.public_url, Math.max(10_000, deadline - Date.now()));
        item = await uploadFile(ctx, folder, name, buf);
      }
      folderUrl ??= (await ensureFolderPath(ctx, folder)).webUrl;
      // The filter makes recording idempotent: a file is listed once per asset.
      await PurchaseOrder.updateOne(
        { _id: po._id, "sharePointFiles.mondayAssetId": { $ne: file.assetId } },
        {
          $set: { sharePointFolderUrl: folderUrl },
          $push: {
            sharePointFiles: {
              source: "monday",
              name: item.name,
              driveItemId: item.id,
              webUrl: item.webUrl,
              size: item.size ?? asset.file_size ?? undefined,
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
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Download from Monday timed out"
          : err instanceof Error
            ? err.message.slice(0, 300)
            : String(err);
      logger.warn("PO file copy to SharePoint failed", { poNumber: po.poNumber, assetId: file.assetId, message });
      if (prevAttempts + 1 >= MAX_ATTEMPTS) await giveUp(po._id, file.assetId, message, prevAttempts + 1);
      else await recordError(po._id, file.assetId, message, prevAttempts + 1);
      result.failed++;
    }
  }
}

// The latest error for one asset (replaces any earlier one). Two updates:
// MongoDB can't $pull and $push the same array in one.
async function recordError(poId: Types.ObjectId, assetId: string, message: string, attempts: number) {
  await PurchaseOrder.updateOne({ _id: poId }, { $pull: { archiveErrors: { assetId } } }, { timestamps: false });
  await PurchaseOrder.updateOne(
    { _id: poId },
    { $push: { archiveErrors: { assetId, message, attempts, at: new Date() } } },
    { timestamps: false }
  );
}

// Stop trying this asset; the error stays visible on the PO page.
async function giveUp(poId: Types.ObjectId, assetId: string, message: string, attempts: number) {
  await PurchaseOrder.updateOne({ _id: poId }, { $addToSet: { archiveGaveUp: assetId } }, { timestamps: false });
  await recordError(poId, assetId, message, attempts);
}
