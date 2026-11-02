"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { poNumberFromFileName } from "@/lib/purchase-orders/poNumber";

const MANUAL_VENDOR_OPTION = "__manual__";
const MAX_FILE_BYTES = 30 * 1024 * 1024;
// SharePoint upload chunks must be a multiple of 320 KiB.
const UPLOAD_CHUNK_BYTES = 320 * 1024 * 16;

type UploadedFile = { ticket: string; driveItemId: string };

type SheetCandidate = {
  name: string;
  rowCount: number;
  headerScore: number;
  headerRow: number | null;
  dataRows: number;
  sample: string[];
};

export function QuoteImportForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? MANUAL_VENDOR_OPTION);
  const [manualVendorName, setManualVendorName] = useState("");
  // The PO is named after the file ("22906.xlsx" -> PO 22906); shown so
  // the user can check it before uploading.
  const [poPreview, setPoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When the import comes back as 409 "which sheet?", keep the candidate
  // list and the already-uploaded file's reference so the picker resubmits
  // without uploading the file again.
  const [sheetPicker, setSheetPicker] = useState<{
    candidates: SheetCandidate[];
    fileName: string;
    uploaded: UploadedFile;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isManualVendor = vendorId === MANUAL_VENDOR_OPTION;

  // Sends the file straight from the browser to SharePoint, in chunks, so
  // file size is never limited by the app's hosting.
  async function uploadToSharePoint(file: File): Promise<UploadedFile> {
    const start = await fetch("/api/quotations/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, size: file.size }),
    });
    const session = await start.json().catch(() => ({}));
    if (!start.ok) throw new Error(session.error ?? `Couldn't start the upload (${start.status})`);

    let item: { id?: string } = {};
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
      setProgress(`Uploading to SharePoint… ${Math.round((end / file.size) * 100)}%`);
      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
      });
      if (!res.ok) throw new Error(`Upload to SharePoint failed (${res.status}). Try again.`);
      if (end === file.size) item = await res.json().catch(() => ({}));
    }
    if (!item.id) throw new Error("Upload to SharePoint didn't complete. Try again.");
    return { ticket: session.ticket as string, driveItemId: item.id };
  }

  function discard(uploaded: UploadedFile) {
    void fetch("/api/quotations/upload-session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploaded),
    }).catch(() => undefined);
  }

  async function importFile(uploaded: UploadedFile, fileName: string, sheetName?: string) {
    setProgress("Reading the file…");
    const res = await fetch("/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: uploaded,
        ...(isManualVendor ? { vendorName: manualVendorName.trim() } : { vendorId }),
        sheetName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.needsSheetChoice) {
      setSheetPicker({ candidates: data.candidates as SheetCandidate[], fileName, uploaded });
      return;
    }
    if (!res.ok) {
      // The upload never became a quote; don't leave it in SharePoint.
      discard(uploaded);
      setSheetPicker(null);
      setError(data.error ?? "Import failed");
      return;
    }
    router.push(`/purchase-orders/quotes/${data.quotationId}`);
  }

  async function run(task: () => Promise<void>) {
    setUploading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (!vendorId) {
      setError("Choose a vendor.");
      return;
    }
    if (isManualVendor && !manualVendorName.trim()) {
      setError("Enter the new vendor's name.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    await run(async () => importFile(await uploadToSharePoint(file), file.name));
  }

  if (sheetPicker) {
    return (
      <SheetPickerPanel
        candidates={sheetPicker.candidates}
        fileName={sheetPicker.fileName}
        onCancel={() => {
          discard(sheetPicker.uploaded);
          setSheetPicker(null);
          setError(null);
        }}
        onPick={(name) => run(() => importFile(sheetPicker.uploaded, sheetPicker.fileName, name))}
        uploading={uploading}
        error={error}
      />
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Vendor">
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          {vendors.length === 0 && <option value="">No vendors yet</option>}
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value={MANUAL_VENDOR_OPTION}>+ Add new vendor…</option>
        </Select>
      </Field>

      {isManualVendor && (
        <Field label="New vendor name">
          <Input
            value={manualVendorName}
            onChange={(e) => setManualVendorName(e.target.value)}
            placeholder="Vendor name"
            autoFocus
          />
        </Field>
      )}

      <Field label="PO file (.xlsx, .xls, or .csv — up to 30 MB, saved to the PO's SharePoint folder)">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          required
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setPoPreview(f ? poNumberFromFileName(f.name) : null);
          }}
          className="text-[0.85rem] text-ink-soft"
        />
        <div className="mt-1.5 text-[0.8rem] text-ink-soft">
          {poPreview ? (
            <>
              This will be <strong className="text-ink font-mono">PO-{poPreview}</strong>. The PO is named after the
              file, and joins the Monday PO with the same number if there is one.
            </>
          ) : (
            "The PO is named after the file, e.g. 22906.xlsx becomes PO-22906."
          )}
        </div>
      </Field>

      <div>
        <Button type="submit" variant="primary" disabled={uploading}>
          <span className="flex items-center gap-1.5">
            <Upload size={14} /> {uploading ? "Working…" : "Upload & parse"}
          </span>
        </Button>
        {progress && <span className="ml-3 text-[0.82rem] text-ink-soft">{progress}</span>}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}

function SheetPickerPanel({
  candidates,
  fileName,
  onPick,
  onCancel,
  uploading,
  error,
}: {
  candidates: SheetCandidate[];
  fileName: string;
  onPick: (sheetName: string) => void;
  onCancel: () => void;
  uploading: boolean;
  error: string | null;
}) {
  // Sort by header-match score so the most likely sheet is first; a
  // sheet that scored 0 still shows (helps the reviewer verify the
  // parser didn't miss their real tab) but is marked.
  const sorted = [...candidates].sort((a, b) => b.headerScore - a.headerScore);
  const [picked, setPicked] = useState<string>(sorted[0]?.name ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="text-ink-soft text-[0.9rem]">
        <strong className="text-ink">{fileName}</strong> has more than one sheet that could be the item
        table. Pick which one to import.
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((c) => {
          const parseable = c.headerScore >= 3 && c.headerRow !== null;
          const active = picked === c.name;
          return (
            <label
              key={c.name}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                active
                  ? "border-brass bg-brass-bg"
                  : "border-border bg-surface hover:border-border-strong"
              } ${!parseable ? "opacity-70" : ""}`}
            >
              <input
                type="radio"
                name="sheet"
                value={c.name}
                checked={active}
                onChange={() => setPicked(c.name)}
                disabled={!parseable}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={14} className="text-ink-faint shrink-0" />
                  <span className="font-mono font-semibold text-[0.86rem]">{c.name}</span>
                  <span className="text-[0.75rem] text-ink-faint">
                    {parseable
                      ? `${c.dataRows} data row${c.dataRows === 1 ? "" : "s"} · header on row ${
                          (c.headerRow ?? 0) + 1
                        } · ${c.headerScore} known columns`
                      : `${c.rowCount} rows · no recognizable header`}
                  </span>
                </div>
                {c.sample.length > 0 && (
                  <div className="text-[0.78rem] text-ink-soft mt-1 truncate">
                    {c.sample.join(" · ")}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!picked || uploading}
          onClick={() => onPick(picked)}
        >
          {uploading ? "Parsing…" : "Use this sheet"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
