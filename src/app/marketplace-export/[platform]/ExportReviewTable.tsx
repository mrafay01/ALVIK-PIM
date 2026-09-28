"use client";

import { useMemo, useState } from "react";
import { Download, CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

type ItemLean = {
  _id: string;
  itemNumber: string;
  category?: string;
  specs?: { metal?: string; gender?: string };
  pricingHistory?: { msrp?: number; ruePrice?: number }[];
};

type ListingLean = {
  _id?: string;
  upc?: string;
  productTitle?: string;
  price?: number;
  weightOz?: number;
  marketplaceCategory?: string;
  readyToExport?: boolean;
} | null;

type Row = { item: ItemLean; listing: ListingLean };

// Fields edited inline in this table — a deliberately small subset of the
// full MarketplaceListing shape (the rest — bullet features, dimensions,
// compliance copy — matters for the generated file but isn't worth a
// dedicated table column; this keeps the review screen scannable for a
// few hundred rows). Everything typed here PATCHes straight to the
// listing overlay, never the Item itself.
export function ExportReviewTable({ platform, rows: initialRows }: { platform: string; rows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const currentPrice = (r: Row) =>
    r.listing?.price ?? r.item.pricingHistory?.[r.item.pricingHistory.length - 1]?.msrp ?? null;

  const selectedCount = selected.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.item._id)));
  }

  function toggleOne(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function saveField(itemId: string, field: string, value: string | number) {
    setSavingId(itemId);
    try {
      const res = await fetch(`/api/marketplace-export/${platform}/listings/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) => (r.item._id === itemId ? { ...r, listing: data.listing } : r))
      );
    } finally {
      setSavingId(null);
    }
  }

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/marketplace-export/${platform}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [...selected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${platform}-export`;

      // The artifact sandbox blocks script-driven downloads, but this is the
      // real app running in the user's own browser, not a published
      // artifact — a normal object-URL download works here.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  const missingSkuCount = useMemo(() => rows.filter((r) => !r.item.itemNumber).length, [rows]);

  return (
    <div>
      <Card className="mb-5">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="text-[0.85rem] text-ink-soft">
            <strong className="text-ink">{selectedCount}</strong> of {rows.length} items selected
          </div>
          <Button size="sm" variant="secondary" onClick={toggleAll}>
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
          <Button variant="primary" disabled={selectedCount === 0 || generating} onClick={generate} className="ml-auto">
            <span className="flex items-center gap-1.5">
              <Download size={14} /> {generating ? "Generating…" : `Download file (${selectedCount})`}
            </span>
          </Button>
        </div>
        {error && <p className="text-critical text-[0.82rem] mt-2 mb-0">{error}</p>}
        {missingSkuCount > 0 && (
          <p className="text-warn text-[0.8rem] mt-2 mb-0">
            {missingSkuCount} item(s) shown have no permanent SKU yet and will be skipped from any export.
          </p>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            No exportable items yet. Items need a permanent SKU and to be past sample review.
          </p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[920px]">
              <thead>
                <tr>
                  {["", "SKU", "Category / Metal", "Product Title", "UPC", "Price", "Weight (oz)", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelected = selected.has(row.item._id);
                  const isSaving = savingId === row.item._id;
                  return (
                    <tr key={row.item._id} className={`border-b border-border align-top ${isSelected ? "bg-brass-bg" : ""}`}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleOne(row.item._id)}
                          className="bg-transparent border-none p-0 cursor-pointer text-brass"
                          aria-label={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? <CheckCircle2 size={18} /> : <Circle size={18} className="text-ink-faint" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">{row.item.itemNumber}</td>
                      <td className="px-4 py-3 text-[0.82rem] text-ink-soft">
                        {row.item.category || "—"} · {row.item.specs?.metal || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          defaultValue={row.listing?.productTitle ?? ""}
                          placeholder="Add a listing title…"
                          onBlur={(e) => saveField(row.item._id, "productTitle", e.target.value)}
                          className="!w-[220px]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          defaultValue={row.listing?.upc ?? ""}
                          placeholder="UPC"
                          onBlur={(e) => saveField(row.item._id, "upc", e.target.value)}
                          className="!w-[130px]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={currentPrice(row) ?? ""}
                          placeholder="Price"
                          onBlur={(e) =>
                            e.target.value !== "" && saveField(row.item._id, "price", Number(e.target.value))
                          }
                          className="!w-[100px] font-mono"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          step="0.1"
                          defaultValue={row.listing?.weightOz ?? ""}
                          placeholder="oz"
                          onBlur={(e) =>
                            e.target.value !== "" && saveField(row.item._id, "weightOz", Number(e.target.value))
                          }
                          className="!w-[80px] font-mono"
                        />
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] text-ink-faint whitespace-nowrap">
                        {isSaving ? "Saving…" : row.listing ? "Listing started" : "Not started"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
