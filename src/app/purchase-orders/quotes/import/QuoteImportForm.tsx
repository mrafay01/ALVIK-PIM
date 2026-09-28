"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const MANUAL_VENDOR_OPTION = "__manual__";

export function QuoteImportForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? MANUAL_VENDOR_OPTION);
  const [manualVendorName, setManualVendorName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [season, setSeason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManualVendor = vendorId === MANUAL_VENDOR_OPTION;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (isManualVendor) {
        formData.append("vendorName", manualVendorName.trim());
      } else {
        formData.append("vendorId", vendorId);
      }
      if (poNumber.trim()) formData.append("poNumber", poNumber.trim());
      if (season.trim()) formData.append("season", season.trim());

      const res = await fetch("/api/quotations", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      router.push(`/purchase-orders/quotes/${data.quotationId}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

      <div className="flex gap-3.5 flex-wrap">
        <Field label="Vendor PO (optional)" width={220}>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-1234" />
        </Field>
        <Field label="Season (optional)" width={160}>
          <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="SS26" />
        </Field>
      </div>

      <Field label="Quote file (.xlsx, .xls, or .csv)">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          required
          className="text-[0.85rem] text-ink-soft"
        />
      </Field>

      <div>
        <Button type="submit" variant="primary" disabled={uploading}>
          <span className="flex items-center gap-1.5">
            <Upload size={14} /> {uploading ? "Parsing…" : "Upload & parse"}
          </span>
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
