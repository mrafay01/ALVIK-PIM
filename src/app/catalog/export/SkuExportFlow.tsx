"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, FileDown, RotateCcw, TriangleAlert, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { PageJump } from "@/components/app/PageJump";
import { downloadCatalogExport } from "@/lib/client/downloadCatalogExport";
import type { SkuLookup } from "@/lib/catalog/exportData";

type LookupResponse = {
  fileName: string;
  duplicates: number;
  blanks: number;
  otherColumns: boolean;
  results: SkuLookup[];
};

type View = "all" | "export" | "flagged" | "not_found";
const PAGE = 50;

// A blank list to fill in: the heading the upload expects, nothing else.
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent("SKUs\n")}`;

function statusPill(r: SkuLookup) {
  switch (r.status) {
    case "catalog":
      return <Pill tone="good">In catalog</Pill>;
    case "unverified":
      return <Pill tone="neutral">Un-verified item</Pill>;
    case "staged":
      return r.parked ? <Pill tone="warn">In Flagged Items</Pill> : <Pill tone="neutral">Waiting on import review</Pill>;
    default:
      return <Pill tone="critical">Not found</Pill>;
  }
}

export function SkuExportFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("all");
  const [page, setPage] = useState(1);
  const [flaggedColumn, setFlaggedColumn] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function readList(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", file);
      let res: Response;
      try {
        res = await fetch("/api/catalog/export/skus", { method: "POST", body: form });
      } catch {
        throw new Error("Couldn't reach the server. Try again.");
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Couldn't read the list (${res.status})`);
      const result = body as LookupResponse;
      setData(result);
      // Everything that was found starts ticked.
      setSelected(new Set(result.results.filter((r) => r.status !== "not_found").map((r) => r.sku)));
      setView("all");
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const results = useMemo(() => data?.results ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: results.length,
      found: results.filter((r) => r.status !== "not_found").length,
      catalog: results.filter((r) => r.status === "catalog").length,
      staged: results.filter((r) => r.status === "staged").length,
      unverified: results.filter((r) => r.status === "unverified").length,
      flagged: results.filter((r) => r.flagged).length,
      notFound: results.filter((r) => r.status === "not_found").length,
    }),
    [results]
  );

  const shown = useMemo(() => {
    switch (view) {
      case "export":
        return results.filter((r) => selected.has(r.sku));
      case "flagged":
        return results.filter((r) => r.flagged);
      case "not_found":
        return results.filter((r) => r.status === "not_found");
      default:
        return results;
    }
  }, [results, view, selected]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pageCount);
  const visible = shown.slice((current - 1) * PAGE, current * PAGE);
  const selectable = shown.filter((r) => r.status !== "not_found");
  const allShownSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.sku));

  function toggle(sku: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(sku);
      else next.delete(sku);
      return next;
    });
  }

  function toggleShown(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of selectable) {
        if (on) next.add(r.sku);
        else next.delete(r.sku);
      }
      return next;
    });
  }

  async function exportNow() {
    setExporting(true);
    setError(null);
    setDone(null);
    try {
      // The SKUs as stored, in the list's order.
      const skus = results.filter((r) => selected.has(r.sku) && r.matchedSku).map((r) => r.matchedSku as string);
      const n = await downloadCatalogExport({ flaggedColumn, skus });
      setDone(`Exported ${n.toLocaleString()} item${n === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function startOver() {
    setData(null);
    setSelected(new Set());
    setError(null);
    setDone(null);
  }

  // ---- Step 1: upload the list
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-[0.98rem] m-0 flex items-center gap-1.5">
          <FileUp size={16} /> 1. Upload your SKU list
        </h2>
        <p className="text-[0.85rem] text-ink-soft m-0 max-w-[70ch]">
          An Excel or CSV file with one column: the heading <code className="font-mono">SKUs</code> in the first cell
          (A1), then one SKU per row. You&apos;ll see what was found before anything is exported.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" loading={reading} onClick={() => inputRef.current?.click()}>
            <span className="flex items-center gap-1.5">
              {!reading && <FileUp size={15} />} {reading ? "Reading the list…" : "Choose file"}
            </span>
          </Button>
          <a href={TEMPLATE_HREF} download="sku-list.csv" className="flex items-center gap-1.5 text-[0.84rem] text-brass no-underline font-semibold">
            <Download size={14} /> Blank SKU list
          </a>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => readList(e.target.files?.[0])}
          />
        </div>
        {error && (
          <p className="flex items-start gap-1.5 text-[0.84rem] text-critical m-0">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    );
  }

  // ---- Step 2: confirm, 3: export
  const notes = [
    data.duplicates > 0 && `${data.duplicates.toLocaleString()} repeated SKU${data.duplicates === 1 ? "" : "s"} listed once`,
    data.blanks > 0 && `${data.blanks.toLocaleString()} row${data.blanks === 1 ? "" : "s"} with no SKU skipped`,
    data.otherColumns && "only the first column was read",
  ].filter(Boolean);
  const tabs: { value: View; label: string; n: number }[] = [
    { value: "all", label: "All", n: counts.all },
    { value: "export", label: "To export", n: selected.size },
    { value: "flagged", label: "Flagged", n: counts.flagged },
    { value: "not_found", label: "Not found", n: counts.notFound },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[0.98rem] m-0 mb-1">2. Check what was found</h2>
          <p className="text-[0.85rem] text-ink-soft m-0">
            <span className="font-mono">{data.fileName}</span>: {counts.all.toLocaleString()} SKU
            {counts.all === 1 ? "" : "s"}. {counts.catalog.toLocaleString()} in the catalog
            {counts.staged > 0 && `, ${counts.staged.toLocaleString()} only as Master File rows (Flagged Items or waiting on review)`}
            {counts.unverified > 0 && `, ${counts.unverified.toLocaleString()} un-verified`}
            {counts.notFound > 0 && `, ${counts.notFound.toLocaleString()} not found`}.
            {counts.flagged > 0 && ` ${counts.flagged.toLocaleString()} flagged.`}
          </p>
          {notes.length > 0 && <p className="text-[0.8rem] text-ink-faint m-0 mt-1">Note: {notes.join("; ")}.</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={startOver} disabled={exporting}>
          <span className="flex items-center gap-1.5">
            <RotateCcw size={13} /> Use another list
          </span>
        </Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setView(t.value);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-full text-[0.82rem] border-0 cursor-pointer ${
              view === t.value ? "font-semibold bg-brass-bg text-brass" : "font-medium bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label} <span className="font-mono text-[0.75rem] opacity-75">{t.n.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2.5 bg-surface-sunken border-b border-border-strong w-[40px]">
                <input
                  type="checkbox"
                  aria-label="Select every SKU shown"
                  checked={allShownSelected}
                  disabled={selectable.length === 0}
                  onChange={(e) => toggleShown(e.target.checked)}
                />
              </th>
              {["SKU in your list", "Found as", "Title", "Where", "Flagged"].map((h) => (
                <th
                  key={h}
                  className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-3.5 py-2.5 border-b border-border-strong whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3.5 py-4 text-[0.85rem] text-ink-faint">
                  Nothing here.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.sku} className="border-b border-border">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Export ${r.sku}`}
                      checked={selected.has(r.sku)}
                      disabled={r.status === "not_found"}
                      onChange={(e) => toggle(r.sku, e.target.checked)}
                    />
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.83rem]">{r.sku}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.83rem] text-ink-soft">
                    {r.matchedSku && r.matchedSku !== r.sku ? r.matchedSku : r.matchedSku ? "same" : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 text-[0.83rem] text-ink-soft max-w-[260px] truncate" title={r.title ?? undefined}>
                    {r.title ?? "—"}
                  </td>
                  <td className="px-3.5 py-2.5">{statusPill(r)}</td>
                  <td className="px-3.5 py-2.5 text-[0.8rem] max-w-[280px]">
                    {r.flagged ? (
                      <span className="text-warn block truncate" title={r.issues.join("\n") || "In Flagged Items"}>
                        Yes{r.issues.length > 0 ? `: ${r.issues.join("; ")}` : ""}
                      </span>
                    ) : (
                      <span className="text-ink-faint">No</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-3 text-[0.82rem] text-ink-soft">
          <Button size="sm" variant="ghost" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span>
            Page {current} of {pageCount}
          </span>
          <Button size="sm" variant="ghost" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            Next
          </Button>
          <PageJump page={current} pageCount={pageCount} onJump={setPage} />
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap border-t border-border pt-4">
        <h2 className="text-[0.98rem] m-0">3. Export</h2>
        <label className="flex items-center gap-2 text-[0.85rem] cursor-pointer">
          <input type="checkbox" checked={flaggedColumn} onChange={(e) => setFlaggedColumn(e.target.checked)} />
          Add a &quot;Flagged&quot; column at the end
        </label>
        <Button variant="primary" loading={exporting} disabled={selected.size === 0} onClick={exportNow}>
          <span className="flex items-center gap-1.5">
            {!exporting && <FileDown size={15} />} Export {selected.size.toLocaleString()} item{selected.size === 1 ? "" : "s"}
          </span>
        </Button>
        {done && <span className="text-[0.84rem] text-good">{done}</span>}
        {error && <span className="text-[0.84rem] text-critical">{error}</span>}
      </div>
    </div>
  );
}
