"use client";

import type { ImageSubfolder } from "@/lib/enums";

export type UploadKind = ImageSubfolder | "auto";

export type ItemMediaEntry = {
  sharePointItemId: string;
  url: string;
  name: string | null;
  subfolder: ImageSubfolder;
  linkStatus: "ok" | "broken" | null;
};

export type UploadedImageResult = {
  media: ItemMediaEntry[];
  imageCompleteness: { main: boolean; sides: boolean; models: boolean };
};

// SharePoint upload chunks must be a multiple of 320 KiB.
const CHUNK = 320 * 1024 * 16;

// Uploads one image or video clip for an item straight from the browser to SharePoint:
// the server opens the upload (and picks the file name for the chosen
// kind), the bytes go directly to SharePoint, then the server records it.
export async function uploadItemImage(
  itemId: string,
  file: File,
  kind: UploadKind,
  onProgress?: (fraction: number) => void
): Promise<UploadedImageResult> {
  const start = await fetch(`/api/items/${itemId}/media/upload-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size, kind }),
  });
  const session = await start.json().catch(() => ({}));
  if (!start.ok) throw new Error(session.error ?? `Couldn't start the upload (${start.status})`);

  let driveItemId: string | undefined;
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, file.size);
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
      body: file.slice(offset, end),
    });
    if (!res.ok) throw new Error(`Upload to SharePoint failed (${res.status})`);
    onProgress?.(end / file.size);
    if (end === file.size) driveItemId = ((await res.json().catch(() => ({}))) as { id?: string }).id;
  }
  if (!driveItemId) throw new Error("Upload to SharePoint didn't complete");

  const confirm = await fetch(`/api/items/${itemId}/media/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: session.ticket, driveItemId }),
  });
  const data = await confirm.json().catch(() => ({}));
  if (!confirm.ok) throw new Error(data.error ?? `Couldn't save the file (${confirm.status})`);
  return data as UploadedImageResult;
}
