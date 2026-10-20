import type { ImageSubfolder } from "@/lib/sharepoint/client";

// Item images in SharePoint: Images/{itemNumber or sampleSku}/{Main|Sides|Models}/
// named {key}.jpg (main), {key}-S{n}.jpg (sides), {key}-M{n}.jpg (models).

export type ImageKind = "main" | "sides" | "models";

export const SUBFOLDER_FOR: Record<ImageKind, ImageSubfolder> = {
  main: "Main",
  sides: "Sides",
  models: "Models",
};

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic"];
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

type MediaLike = { url?: string | null; name?: string | null; subfolder?: string | null; linkStatus?: string | null };

export function extensionOf(fileName: string): string {
  const m = /\.[^.]+$/.exec(fileName);
  return m ? m[0].toLowerCase() : "";
}

export function mediaFileName(m: MediaLike): string {
  if (m.name) return m.name;
  const last = (m.url ?? "").split("?")[0].split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

// The file name an upload of this kind should get. Main is always
// "{key}.ext" (a re-upload replaces it); sides/models take the next free
// number after the ones already on the item.
export function conventionalImageName(key: string, kind: ImageKind, ext: string, media: MediaLike[]): string {
  if (kind === "main") return `${key}${ext}`;
  const letter = kind === "sides" ? "S" : "M";
  const rx = new RegExp(`-${letter}(\\d+)$`, "i");
  let max = 0;
  for (const m of media) {
    if (m.subfolder !== kind) continue;
    const stem = mediaFileName(m).replace(/\.[^.]+$/, "");
    const n = Number(rx.exec(stem)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return `${key}-${letter}${max + 1}${ext}`;
}

// A subfolder counts as present when it has at least one image that isn't
// known to be broken.
export function imageCompletenessOf(media: MediaLike[]) {
  const live = media.filter((m) => m.linkStatus !== "broken");
  return {
    main: live.some((m) => m.subfolder === "main"),
    sides: live.some((m) => m.subfolder === "sides"),
    models: live.some((m) => m.subfolder === "models"),
  };
}
