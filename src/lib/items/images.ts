import type { ImageSubfolder } from "@/lib/sharepoint/client";
import type { ImageSubfolder as ImageKindEnum } from "@/lib/enums";

// Item media in SharePoint: Images/{itemNumber or sampleSku}/{Main|Sides|Models|Lifestyle|Videos}/
// named {key}.jpg (main), {key}-S{n}.jpg (sides), {key}-M{n}.jpg (models),
// {key}-LS{n}.jpg (lifestyle, optional), {key}-V{n}.mp4 (video clips, optional).

export type ImageKind = ImageKindEnum;

export const SUBFOLDER_FOR: Record<ImageKind, ImageSubfolder> = {
  main: "Main",
  sides: "Sides",
  models: "Models",
  lifestyle: "Lifestyle",
  videos: "Videos",
};

// What a numbered file's name carries after "{key}-".
const NUMBER_PREFIX: Record<Exclude<ImageKind, "main">, string> = { sides: "S", models: "M", lifestyle: "LS", videos: "V" };

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic"];
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
// Video clips go browser -> SharePoint in chunks like images, so the cap is
// ours, not the hosting platform's.
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".wmv"];
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

type MediaLike = { url?: string | null; name?: string | null; subfolder?: string | null; linkStatus?: string | null };

export function extensionOf(fileName: string): string {
  const m = /\.[^.]+$/.exec(fileName);
  return m ? m[0].toLowerCase() : "";
}

// Why this file can't be uploaded into this folder, or null when it can:
// the Videos folder takes video files only, every other folder images only.
export function mediaFileProblem(subfolder: ImageSubfolder, fileName: string, size: number): string | null {
  const ext = extensionOf(fileName);
  if (subfolder === "Videos") {
    if (!VIDEO_EXTENSIONS.includes(ext)) return `"${fileName}" isn't a video file (${VIDEO_EXTENSIONS.join(", ")})`;
    if (size > MAX_VIDEO_BYTES) return `"${fileName}" is larger than ${MAX_VIDEO_BYTES / 1024 / 1024 / 1024} GB`;
    return null;
  }
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    return VIDEO_EXTENSIONS.includes(ext)
      ? `"${fileName}" is a video: upload it as a video clip`
      : `"${fileName}" isn't an image file (${IMAGE_EXTENSIONS.join(", ")})`;
  }
  if (size > MAX_IMAGE_BYTES) return `"${fileName}" is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`;
  return null;
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
// "{key}.ext" (a re-upload replaces it); the other kinds take the next free
// number after the ones already on the item.
export function conventionalImageName(key: string, kind: ImageKind, ext: string, media: MediaLike[]): string {
  if (kind === "main") return `${key}${ext}`;
  const letter = NUMBER_PREFIX[kind];
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
// known to be broken. Lifestyle images and videos are optional, so they're
// not part of it.
export function imageCompletenessOf(media: MediaLike[]) {
  const live = media.filter((m) => m.linkStatus !== "broken");
  return {
    main: live.some((m) => m.subfolder === "main"),
    sides: live.some((m) => m.subfolder === "sides"),
    models: live.some((m) => m.subfolder === "models"),
  };
}
