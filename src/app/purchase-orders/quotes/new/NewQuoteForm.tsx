"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Field, Input, Select, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { QUOTE_FIELDS, QUOTE_HEADER_TO_KEY, IMAGE_PLACEHOLDER_NOTE } from "@/lib/quote-import/fields";
import { formatPoNumber } from "@/lib/purchase-orders/poNumber";

type ItemRow = {
  fields: Record<string, string>;
  custom: Record<string, string>;
};

function emptyRow(customCols: string[]): ItemRow {
  const fields: Record<string, string> = {};
  for (const f of QUOTE_FIELDS) {
    fields[f.key] = f.kind === "image" ? IMAGE_PLACEHOLDER_NOTE : "";
  }
  const custom: Record<string, string> = {};
  for (const c of customCols) custom[c] = "";
  return { fields, custom };
}

function inputType(kind: string): string {
  if (kind === "number" || kind === "money" || kind === "weight") return "number";
  if (kind === "date") return "date";
  return "text";
}

const INPUT_CLASS =
  "font-body text-[0.86rem] px-3 py-2 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)] disabled:opacity-60";

const MANUAL_VENDOR_OPTION = "__manual__";

export function NewQuoteForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? MANUAL_VENDOR_OPTION);
  const [manualVendorName, setManualVendorName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [newColName, setNewColName] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([emptyRow([])]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(rowIdx: number, key: string, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, fields: { ...r.fields, [key]: value } } : r))
    );
  }
  function updateCustom(rowIdx: number, label: string, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, custom: { ...r.custom, [label]: value } } : r))
    );
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow(customCols)]);
  }
  function removeRow(idx: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function addColumn() {
    const name = newColName.trim();
    if (!name) return;
    if (customCols.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setError(`Column "${name}" already added.`);
      return;
    }
    if (QUOTE_HEADER_TO_KEY[name.toLowerCase()]) {
      setError(`"${name}" is already a standard field.`);
      return;
    }
    if (customCols.length >= 20) {
      setError("Up to 20 custom columns.");
      return;
    }
    setError(null);
    setCustomCols((prev) => [...prev, name]);
    setRows((prev) => prev.map((r) => ({ ...r, custom: { ...r.custom, [name]: "" } })));
    setNewColName("");
  }
  function removeColumn(name: string) {
    setCustomCols((prev) => prev.filter((c) => c !== name));
    setRows((prev) =>
      prev.map((r) => {
        const { [name]: _drop, ...rest } = r.custom;
        void _drop;
        return { ...r, custom: rest };
      })
    );
  }

  const isManualVendor = vendorId === MANUAL_VENDOR_OPTION;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!vendorId) {
      setError("Choose a vendor.");
      return;
    }
    if (isManualVendor && !manualVendorName.trim()) {
      setError("Enter the new vendor's name.");
      return;
    }
    if (!formatPoNumber(poNumber)) {
      setError("Enter the PO number.");
      return;
    }

    const items = rows.map((r) => {
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.fields)) {
        if (v.trim() !== "") fields[k] = v.trim();
      }
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.custom)) {
        if (v.trim() !== "") custom[k] = v.trim();
      }
      return Object.keys(custom).length > 0 ? { fields, custom } : { fields };
    });

    if (items.every((it) => !it.fields.itemNumber && !it.fields.vendorSku)) {
      setError("At least one item needs a CZ item number or a vendor item#.");
      return;
    }

    setSubmitting(true);
    let navigating = false;
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: isManualVendor ? undefined : vendorId,
          vendorName: isManualVendor ? manualVendorName.trim() : undefined,
          poNumber: poNumber.trim(),
          customColumns: customCols.length > 0 ? customCols : undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save the quote");
        return;
      }
      // Keep the button busy while the next page loads.
      navigating = true;
      router.push(`/purchase-orders/quotes/${data.quotationId}`);
    } finally {
      if (!navigating) setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <h2 className="text-[0.95rem] mb-3.5">Quote details</h2>
        <div className="flex gap-3.5 flex-wrap items-end">
          <Field label="Vendor" width={200}>
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
            <Field label="New vendor name" width={200}>
              <Input
                value={manualVendorName}
                onChange={(e) => setManualVendorName(e.target.value)}
                placeholder="Vendor name"
                autoFocus
              />
            </Field>
          )}
          <Field label="PO number" width={180}>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="22906" required />
          </Field>
        </div>
        <p className="text-[0.8rem] text-ink-soft mt-2 mb-0">
          {formatPoNumber(poNumber) ? (
            <>
              This will be <strong className="text-ink font-mono">{formatPoNumber(poNumber)}</strong>.
            </>
          ) : (
            "Saved as PO-<number>, the same as an uploaded file named <number>.xlsx."
          )}
        </p>

        <div className="mt-5 pt-4 border-t border-border">
          <span className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide">
            Custom columns
          </span>
          <p className="text-[0.8rem] text-ink-soft mt-1 mb-2.5">
            Add a column this quote needs that isn&apos;t one of the standard fields. It shows on
            every item below.
          </p>
          {customCols.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {customCols.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 text-[0.8rem] bg-brass-bg text-brass px-2.5 py-1 rounded-full"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeColumn(c)}
                    aria-label={`Remove ${c}`}
                    className="hover:text-critical"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addColumn();
                }
              }}
              placeholder="e.g. Bail size"
              className="!w-[200px]"
            />
            <Button onClick={addColumn}>
              <span className="flex items-center gap-1.5">
                <Plus size={13} /> Add column
              </span>
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {rows.map((row, rowIdx) => (
          <Card key={rowIdx}>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[0.9rem] font-semibold m-0">Item {rowIdx + 1}</h3>
              <Button
                size="sm"
                variant="danger"
                disabled={rows.length === 1}
                onClick={() => removeRow(rowIdx)}
              >
                <span className="flex items-center gap-1">
                  <Trash2 size={13} /> Remove
                </span>
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {QUOTE_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide">
                    {f.label}
                  </span>
                  <input
                    type={inputType(f.kind)}
                    step={inputType(f.kind) === "number" ? "any" : undefined}
                    value={row.fields[f.key] ?? ""}
                    disabled={f.kind === "image"}
                    onChange={(e) => updateField(rowIdx, f.key, e.target.value)}
                    placeholder={f.kind === "image" ? IMAGE_PLACEHOLDER_NOTE : undefined}
                    className={INPUT_CLASS}
                  />
                </label>
              ))}
            </div>

            {customCols.length > 0 && (
              <div className="mt-4 pt-3.5 border-t border-border">
                <span className="text-[0.68rem] font-semibold text-brass uppercase tracking-wide">
                  Custom columns
                </span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 mt-2">
                  {customCols.map((c) => (
                    <label key={c} className="flex flex-col gap-1.5">
                      <span className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide">
                        {c}
                      </span>
                      <input
                        type="text"
                        value={row.custom[c] ?? ""}
                        onChange={(e) => updateCustom(rowIdx, c, e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={addRow}>
          <span className="flex items-center gap-1.5">
            <Plus size={14} /> Add item
          </span>
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? "Saving…" : `Save quote (${rows.length} item${rows.length === 1 ? "" : "s"})`}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </form>
  );
}
