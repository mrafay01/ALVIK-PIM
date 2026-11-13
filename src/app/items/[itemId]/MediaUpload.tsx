"use client";

import { useRef, useState } from "react";
import { Upload, ImageIcon, CheckCircle2, Circle, TriangleAlert, ExternalLink, Link2Off, Film } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { uploadItemImage, type ItemMediaEntry, type UploadKind } from "@/lib/client/uploadItemImage";
import { MEDIA_KIND_LABEL, MEDIA_UPLOAD_OPTIONS, acceptFor } from "@/lib/items/mediaKinds";

interface Completeness {
  main: boolean;
  sides: boolean;
  models: boolean;
}

const KIND_OPTIONS: { value: UploadKind; label: string }[] = [
  { value: "auto", label: "Use the file names" },
  ...MEDIA_UPLOAD_OPTIONS,
];

function displayName(m: ItemMediaEntry): string {
  if (m.name) return m.name;
  const last = m.url.split("?")[0].split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function MediaUpload({
  itemId,
  folderKey,
  canUpload = true,
  initialMedia,
  initialCompleteness,
}: {
  itemId: string;
  folderKey: string | null;
  canUpload?: boolean;
  initialMedia: ItemMediaEntry[];
  initialCompleteness: Completeness;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState(initialMedia);
  const [completeness, setCompleteness] = useState(initialCompleteness);
  const [kind, setKind] = useState<UploadKind>("auto");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ filename: string; error: string }[]>([]);

  // Files go one at a time straight from the browser to SharePoint, so size
  // isn't limited by the app's hosting, and a failed file doesn't stop the rest.
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    setFailed([]);
    const failures: { filename: string; error: string }[] = [];
    try {
      for (const [i, file] of list.entries()) {
        try {
          const result = await uploadItemImage(itemId, file, kind, (f) =>
            setProgress(
              `Uploading ${list.length > 1 ? `${i + 1} of ${list.length}` : file.name}… ${Math.round(f * 100)}%`
            )
          );
          setMedia(result.media);
          setCompleteness(result.imageCompleteness);
        } catch (err) {
          failures.push({ filename: file.name, error: err instanceof Error ? err.message : String(err) });
        }
      }
      setFailed(failures);
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!folderKey) {
    return (
      <Card>
        <h2 className="text-[0.95rem] mb-2 flex items-center gap-1.5">
          <ImageIcon size={15} /> Images &amp; video
        </h2>
        <p className="text-[0.85rem] text-ink-faint m-0">
          This item needs a sample SKU or permanent item number before images or videos can be uploaded.
        </p>
      </Card>
    );
  }

  const broken = media.filter((m) => m.linkStatus === "broken").length;
  const optionalCount = (k: "lifestyle" | "videos") =>
    media.filter((m) => m.subfolder === k && m.linkStatus !== "broken").length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-[0.95rem] flex items-center gap-1.5">
          <ImageIcon size={15} /> Images &amp; video
        </h2>
        {canUpload && (
          <div className="flex items-center gap-2">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as UploadKind)}
              disabled={uploading}
              aria-label="Upload as"
              className="!py-1.5 !w-[180px] !text-[0.82rem]"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button size="sm" loading={uploading} onClick={() => fileInputRef.current?.click()}>
              <span className="flex items-center gap-1.5">
                {!uploading && <Upload size={13} />} {uploading ? "Uploading…" : "Upload"}
              </span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple={kind !== "main"}
              accept={acceptFor(kind)}
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}
      </div>
      <p className="text-[0.78rem] text-ink-faint mb-3">
        {kind === "auto" ? (
          <>
            Name files <code className="font-mono">{folderKey}.jpg</code> for the main shot,{" "}
            <code className="font-mono">{folderKey}-S1.jpg</code> for sides,{" "}
            <code className="font-mono">{folderKey}-M1.jpg</code> for models,{" "}
            <code className="font-mono">{folderKey}-LS1.jpg</code> for optional lifestyle shots and{" "}
            <code className="font-mono">{folderKey}-V1.mp4</code> for optional video clips; each goes to its
            SharePoint folder by the name.
          </>
        ) : kind === "videos" ? (
          <>Video clips up to 1 GB (MP4, MOV, WebM…). Any file name works: it&apos;s renamed to the video convention on upload.</>
        ) : (
          <>Any file name works: it&apos;s renamed to the {MEDIA_KIND_LABEL[kind].toLowerCase()} convention on upload.</>
        )}
      </p>

      <div className="flex gap-4 mb-3.5 flex-wrap">
        {(["main", "sides", "models"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5 text-[0.82rem]">
            {completeness[key] ? (
              <CheckCircle2 size={14} color="var(--good)" />
            ) : (
              <Circle size={14} color="var(--ink-faint)" />
            )}
            {MEDIA_KIND_LABEL[key]}
          </span>
        ))}
        {/* Optional: shown as a count, never as missing. */}
        {(["lifestyle", "videos"] as const).map((key) => {
          const n = optionalCount(key);
          return (
            <span key={key} className="flex items-center gap-1.5 text-[0.82rem] text-ink-soft">
              {n > 0 ? <CheckCircle2 size={14} color="var(--good)" /> : <Circle size={14} color="var(--ink-faint)" />}
              {MEDIA_KIND_LABEL[key]} <span className="text-ink-faint">(optional{n > 0 ? `, ${n}` : ""})</span>
            </span>
          );
        })}
        {broken > 0 && (
          <span className="flex items-center gap-1.5 text-[0.82rem] text-critical">
            <Link2Off size={14} /> {broken} broken link{broken === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {progress && <p className="text-[0.82rem] text-ink-soft mb-2.5">{progress}</p>}
      {failed.map((f, i) => (
        <div key={i} className="flex gap-1.5 items-start text-warn text-[0.82rem] mb-1.5">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          {f.filename}: {f.error}
        </div>
      ))}

      {media.length === 0 ? (
        <p className="text-[0.85rem] text-ink-faint m-0">No images or videos uploaded yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {media.map((m) =>
            m.linkStatus === "broken" ? (
              <span
                key={m.sharePointItemId}
                className="flex items-center gap-1.5 text-[0.83rem] text-critical py-0.5"
                title="This file is no longer in SharePoint"
              >
                <Link2Off size={12} />
                <span>{MEDIA_KIND_LABEL[m.subfolder] ?? m.subfolder}</span>
                <span className="font-mono">{displayName(m)}</span>
                <span>(missing from SharePoint)</span>
              </span>
            ) : (
              <a
                key={m.sharePointItemId}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[0.83rem] text-brass no-underline py-0.5"
              >
                {m.subfolder === "videos" ? <Film size={12} /> : <ExternalLink size={12} />}
                <span>{MEDIA_KIND_LABEL[m.subfolder] ?? m.subfolder}</span>
                <span className="font-mono text-ink-soft">{displayName(m)}</span>
                <span className="text-ink-faint">(view on SharePoint)</span>
              </a>
            )
          )}
        </div>
      )}
    </Card>
  );
}
