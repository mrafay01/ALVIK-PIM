"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Card } from "@/components/ui/Card";

type ChangeRow = {
  _id: string;
  field: string;
  fieldLabel: string;
  oldValue: unknown;
  newValue: unknown;
  source: "pi_conflict" | "manual_edit" | "import";
  sourceRef?: {
    quotationId?: { _id: string; sourceFileName?: string; poNumber?: string } | null;
    userId?: { _id: string; name?: string; email?: string } | null;
  };
  createdAt: string;
};

const SOURCE_LABEL: Record<ChangeRow["source"], string> = {
  pi_conflict: "PI conflict resolve",
  manual_edit: "Manual edit",
  import: "Import",
};

// Loaded on open rather than on mount — the item-detail page is already
// heavy, and the history is only interesting when someone actually
// clicks to see it.
export function ChangeHistory({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || rows !== null) return;
    setLoading(true);
    setError(null);
    fetch(`/api/items/${itemId}/changes`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setRows(data.changes as ChangeRow[]))
      .catch(() => setError("Couldn't load the change history."))
      .finally(() => setLoading(false));
  }, [open, rows, itemId]);

  return (
    <Card padding={0} className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown size={15} className="text-ink-faint" /> : <ChevronRight size={15} className="text-ink-faint" />}
        <History size={14} className="text-ink-faint" />
        <span className="font-semibold text-[0.9rem]">Change history</span>
        <span className="text-[0.78rem] text-ink-faint ml-auto">
          Authoritative fields only — weight, size, vendor SKU
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border">
          {loading && <p className="text-[0.84rem] text-ink-soft py-3">Loading…</p>}
          {error && <p className="text-[0.84rem] text-critical py-3">{error}</p>}
          {rows && rows.length === 0 && (
            <p className="text-[0.84rem] text-ink-faint py-3">
              No authoritative-field changes recorded yet.
            </p>
          )}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse mt-2">
                <thead>
                  <tr>
                    {["When", "Field", "From", "To", "Source", "By"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-faint px-2 py-1.5 border-b border-border whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-1.5 text-[0.8rem] text-ink-soft whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-[0.84rem] font-semibold">{r.fieldLabel}</td>
                      <td className="px-2 py-1.5 font-mono text-[0.82rem]">{fmt(r.oldValue)}</td>
                      <td className="px-2 py-1.5 font-mono text-[0.82rem]">{fmt(r.newValue)}</td>
                      <td className="px-2 py-1.5 text-[0.8rem]">
                        {r.sourceRef?.quotationId ? (
                          <Link
                            href={`/purchase-orders/quotes/${r.sourceRef.quotationId._id}`}
                            className="text-navy-deep no-underline"
                          >
                            {r.sourceRef.quotationId.sourceFileName ??
                              r.sourceRef.quotationId.poNumber ??
                              SOURCE_LABEL[r.source]}
                          </Link>
                        ) : (
                          SOURCE_LABEL[r.source]
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[0.8rem] text-ink-soft">
                        {r.sourceRef?.userId?.name ?? r.sourceRef?.userId?.email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" || typeof v === "string") return String(v);
  return JSON.stringify(v);
}
