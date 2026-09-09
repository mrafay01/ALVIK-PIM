"use client";

import { useRef, useState } from "react";
import { Upload, ImageIcon, CheckCircle2, Circle, TriangleAlert, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface MediaEntry {
  sharePointItemId: string;
  url: string;
  subfolder: "main" | "sides" | "models";
  uploadedAt?: string;
}

interface Completeness {
  main: boolean;
  sides: boolean;
  models: boolean;
}

const SUBFOLDER_LABEL: Record<Completeness extends never ? never : keyof Completeness, string> = {
  main: "Main",
  sides: "Sides",
  models: "Models",
};

export function MediaUpload({
  itemId,
  folderKey,
  initialMedia,
  initialCompleteness,
}: {
  itemId: string;
  folderKey: string | null;
  initialMedia: MediaEntry[];
  initialCompleteness: Completeness;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState(initialMedia);
  const [completeness, setCompleteness] = useState(initialCompleteness);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ filename: string; error: string }[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setFailed([]);

    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);

    try {
      const res = await fetch(`/api/items/${itemId}/media`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

      if (data.uploaded.length > 0) {
        setMedia((prev) => [
          ...prev,
          ...data.uploaded.map((u: { filename: string; subfolder: string; url: string }) => ({
            sharePointItemId: u.url,
            url: u.url,
            subfolder: u.subfolder,
          })),
        ]);
      }
      setCompleteness(data.imageCompleteness);
      if (data.failed.length > 0) setFailed(data.failed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!folderKey) {
    return (
      <Card>
        <h2 className="text-[0.95rem] mb-2 flex items-center gap-1.5">
          <ImageIcon size={15} /> Images
        </h2>
        <p className="text-[0.85rem] text-ink-faint m-0">
          This item needs a sample SKU or permanent item number before images can be uploaded.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[0.95rem] flex items-center gap-1.5">
          <ImageIcon size={15} /> Images
        </h2>
        <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <span className="flex items-center gap-1.5">
            <Upload size={13} /> {uploading ? "Uploading…" : "Upload"}
          </span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <p className="text-[0.78rem] text-ink-faint mb-3">
        Name files <code className="font-mono">{folderKey}.jpg</code> for the main shot,{" "}
        <code className="font-mono">{folderKey}-S1.jpg</code> for sides,{" "}
        <code className="font-mono">{folderKey}-M1.jpg</code> for models — routed to SharePoint
        automatically by the suffix.
      </p>

      <div className="flex gap-4 mb-3.5">
        {(["main", "sides", "models"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5 text-[0.82rem]">
            {completeness[key] ? <CheckCircle2 size={14} color="var(--good)" /> : <Circle size={14} color="var(--ink-faint)" />}
            {SUBFOLDER_LABEL[key]}
          </span>
        ))}
      </div>

      {error && (
        <div className="flex gap-1.5 items-start text-critical text-[0.83rem] mb-2.5">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {failed.map((f, i) => (
        <div key={i} className="flex gap-1.5 items-start text-warn text-[0.82rem] mb-1.5">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          {f.filename}: {f.error}
        </div>
      ))}

      {media.length === 0 ? (
        <p className="text-[0.85rem] text-ink-faint m-0">No images uploaded yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {media.map((m, i) => (
            <a
              key={i}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[0.83rem] text-brass no-underline py-0.5"
            >
              <ExternalLink size={12} />
              <span className="capitalize">{m.subfolder}</span>
              <span className="text-ink-faint">— view on SharePoint</span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
