"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, CircleAlert } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function QuoteImportForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [poNumber, setPoNumber] = useState("");
  const [season, setSeason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vendorId", vendorId);
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
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (vendors.length === 0) {
    return (
      <p className="text-critical text-[0.87rem] flex items-center gap-1.5">
        <CircleAlert size={15} /> No vendors yet — seed a vendor first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Vendor">
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-3.5 flex-wrap">
        <Field label="Vendor PO / quote ref (optional)" width={220}>
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
