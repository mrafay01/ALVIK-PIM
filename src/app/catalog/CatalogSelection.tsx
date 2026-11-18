"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FileDown, ListPlus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { downloadCatalogExport } from "@/lib/client/downloadCatalogExport";
import { MAX_EXPORT_ITEMS } from "@/lib/catalog/exportLimits";

// Ticking catalog rows for export. The selection survives paging and
// filtering (kept for this browser tab in sessionStorage), so items can be
// picked from several pages before exporting them together.

type Selected = Map<string, string>; // item id -> SKU
type Ctx = {
  enabled: boolean;
  selected: Selected;
  pageItems: { id: string; sku: string }[];
  toggle: (id: string, sku: string, on: boolean) => void;
  setPage: (on: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "czc.catalogExport.selection";

function useSelection(): Ctx {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("CatalogSelectionProvider missing");
  return ctx;
}

export function CatalogSelectionProvider({
  enabled,
  pageItems,
  children,
}: {
  enabled: boolean;
  pageItems: { id: string; sku: string }[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Selected>(new Map());

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as [string, string][];
      if (Array.isArray(saved) && saved.length > 0) setSelected(new Map(saved));
    } catch {
      /* nothing saved, or storage blocked */
    }
  }, []);

  const save = useCallback((next: Selected) => {
    setSelected(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* storage blocked: the selection still works on this page */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      enabled,
      selected,
      pageItems,
      toggle: (id, sku, on) => {
        const next = new Map(selected);
        if (on) next.set(id, sku);
        else next.delete(id);
        save(next);
      },
      setPage: (on) => {
        const next = new Map(selected);
        for (const it of pageItems) {
          if (on) next.set(it.id, it.sku);
          else next.delete(it.id);
        }
        save(next);
      },
      clear: () => save(new Map()),
    }),
    [enabled, selected, pageItems, save]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function RowSelect({ id, sku }: { id: string; sku: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${sku} for export`}
      checked={selected.has(id)}
      onChange={(e) => toggle(id, sku, e.target.checked)}
      className="cursor-pointer"
    />
  );
}

export function PageSelect() {
  const { selected, pageItems, setPage } = useSelection();
  const all = pageItems.length > 0 && pageItems.every((it) => selected.has(it.id));
  return (
    <input
      type="checkbox"
      aria-label="Select every item on this page"
      checked={all}
      onChange={(e) => setPage(e.target.checked)}
      className="cursor-pointer"
    />
  );
}

export function CatalogExportBar({
  total,
  filters,
}: {
  total: number;
  filters: Record<string, string | undefined>;
}) {
  const { selected, clear } = useSelection();
  const [flaggedColumn, setFlaggedColumn] = useState(true);
  const [busy, setBusy] = useState<"selected" | "all" | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "critical"; text: string } | null>(null);

  async function run(which: "selected" | "all") {
    setBusy(which);
    setNote(null);
    try {
      const n = await downloadCatalogExport(
        which === "selected" ? { flaggedColumn, itemIds: [...selected.keys()] } : { flaggedColumn, filters }
      );
      setNote({ tone: "good", text: `Exported ${n.toLocaleString()} item${n === 1 ? "" : "s"}.` });
    } catch (err) {
      setNote({ tone: "critical", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const count = selected.size;
  const filtered = Object.values(filters).some(Boolean);
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-semibold text-[0.9rem]">
          <FileDown size={16} className="text-brand" /> Export
        </span>
        <span className="text-[0.84rem] text-ink-soft">
          {count > 0 ? `${count.toLocaleString()} selected` : "Tick items to export them, or export everything listed."}
        </span>
        {count > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-[0.8rem] text-ink-faint bg-transparent border-0 cursor-pointer hover:text-ink"
          >
            <X size={12} /> Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-[0.84rem] cursor-pointer ml-auto">
          <input type="checkbox" checked={flaggedColumn} onChange={(e) => setFlaggedColumn(e.target.checked)} />
          Add a &quot;Flagged&quot; column
        </label>
        <Button
          size="sm"
          variant="primary"
          disabled={count === 0 || !!busy || count > MAX_EXPORT_ITEMS}
          loading={busy === "selected"}
          onClick={() => run("selected")}
        >
          Export selected{count > 0 ? ` (${count.toLocaleString()})` : ""}
        </Button>
        <Button
          size="sm"
          disabled={total === 0 || !!busy || total > MAX_EXPORT_ITEMS}
          loading={busy === "all"}
          onClick={() => run("all")}
        >
          Export all {total.toLocaleString()}
          {filtered ? " matching" : ""}
        </Button>
        <Link
          href="/catalog/export"
          className="flex items-center gap-1.5 text-[0.84rem] text-brand no-underline font-semibold"
        >
          <ListPlus size={14} /> Export from a SKU list
        </Link>
      </div>
      {total > MAX_EXPORT_ITEMS && (
        <p className="text-[0.76rem] text-ink-faint mt-2 mb-0">
          Up to {MAX_EXPORT_ITEMS.toLocaleString()} items per export. Narrow the filters to export the rest.
        </p>
      )}
      {note && <p className={`text-[0.82rem] mt-1.5 mb-0 ${note.tone === "good" ? "text-good" : "text-critical"}`}>{note.text}</p>}
    </Card>
  );
}
