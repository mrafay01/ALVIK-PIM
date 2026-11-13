import type { ImageSubfolder } from "@/lib/enums";

// Labels and file-picker settings for each media type, shared by every
// upload screen (Images page, item page) so they offer the same choices.

export type MediaUploadKind = ImageSubfolder | "auto";

export const MEDIA_KIND_LABEL: Record<ImageSubfolder, string> = {
  main: "Main",
  sides: "Sides",
  models: "Models",
  lifestyle: "Lifestyle",
  videos: "Video",
};

// The "Upload as" choices, in folder order.
export const MEDIA_UPLOAD_OPTIONS: { value: ImageSubfolder; label: string }[] = [
  { value: "main", label: "Main image" },
  { value: "sides", label: "Side images" },
  { value: "models", label: "Model images" },
  { value: "lifestyle", label: "Lifestyle images (optional)" },
  { value: "videos", label: "Video clips (optional)" },
];

// What the file picker offers: videos for the video type, images for the
// others, both when the file names decide.
export function acceptFor(kind: MediaUploadKind): string {
  if (kind === "videos") return "video/*";
  if (kind === "auto") return "image/*,video/*";
  return "image/*";
}

// How a file of this type is named in SharePoint, e.g. "A1234-V1.mp4, -V2…".
export function exampleNameFor(sku: string, kind: ImageSubfolder): string {
  switch (kind) {
    case "main":
      return `${sku}.jpg`;
    case "sides":
      return `${sku}-S1.jpg, -S2…`;
    case "models":
      return `${sku}-M1.jpg, -M2…`;
    case "lifestyle":
      return `${sku}-LS1.jpg, -LS2…`;
    case "videos":
      return `${sku}-V1.mp4, -V2…`;
  }
}

export function isVideo(kind: MediaUploadKind): boolean {
  return kind === "videos";
}
