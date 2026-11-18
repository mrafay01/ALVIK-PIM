"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";

const ACCEPT = [".xlsx", ".xls"];

// Master File upload: drop a file (or browse), then "Upload & review".
// The file is parsed and staged as an import batch; nothing reaches the
// catalog until rows are approved and committed on the review screen.
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setError("Choose an Excel file (.xlsx or .xls).");
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    setUploading(true);
    let navigating = false;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/import-review", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 413
            ? "This file is too large to upload in one go. Split it into smaller files and import each one."
            : data.error ?? "Upload failed"
        );
        return;
      }
      // Keep the button busy while the review page loads.
      navigating = true;
      router.push(`/catalog/import/${data.batchId}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      if (!navigating) setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors duration-150 ${
          dragging ? "border-brand bg-brand-bg" : "border-border-strong bg-surface-sunken hover:border-brand"
        }`}
      >
        <UploadCloud size={28} className={dragging ? "text-brand" : "text-ink-faint"} />
        <div className="text-[0.92rem] font-semibold text-ink">Drop the Master File here, or click to browse</div>
        <div className="text-[0.8rem] text-ink-faint">Excel .xlsx or .xls</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {file && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 text-[0.85rem] px-3 py-2 rounded-sm bg-surface-sunken border border-border">
            <FileSpreadsheet size={15} className="text-brand" />
            <span className="font-medium">{file.name}</span>
            <span className="text-ink-faint">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            {!uploading && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                aria-label="Remove file"
                className="text-ink-faint hover:text-critical bg-transparent border-0 p-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </span>
          <Button variant="primary" loading={uploading} onClick={upload}>
            {uploading ? "Reading the file…" : "Upload & review"}
          </Button>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
