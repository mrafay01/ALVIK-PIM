"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert, Database, Search, Flag, Send, XCircle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/app/Pagination";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";
import { commitInSlices, commitSummary } from "@/lib/client/commitInSlices";

type Row = {
  _id: string;
  rowNumber: number;
  coerced: Record<string, unknown>;
  issues: { label: string; message: string }[];
  // An item with this SKU already exists: committing updates it.
  updates: { sku: string; inCatalog: boolean } | null;
};

type Counts = { total: number; flagged: number; unflagged: number; parked: number; committed: number; fileRows: number };
type Action = "commit" | "park" | "exclude";
type Scope = "unflagged" | "flagged" | "all" | "selected";

function text(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}
function money(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;
}

export function ReviewTable({
  batchId,
  rows,
  q,
  page,
  counts,
}: {
  batchId: string;
  rows: Row[];
  q: string;
  page: number;
  counts: Counts;
}) {
  const router = useRouter();
  const { refresh, refreshing } = useRefreshAfterSave();
  const [pending, setPending] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const busy = pending ?? (refreshing ? last : null);
  const [result, setResult] = useState<{ tone: "good" | "critical"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rowKey = rows.map((r) => r._id).join(",");
  useEffect(() => setSelected(new Set()), [rowKey]);

  async function act(action: Action, scope: Scope, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const key = `${action}:${scope}`;
    setPending(key);
    setLast(key);
    setResult(null);
    const body = { action, scope, q: q || undefined, rowIds: scope === "selected" ? [...selected] : undefined };
    try {
      if (action === "commit") {
        // A large file is committed over several calls (~40 s each): each
        // returns `next` until every row has been tried.
        const total = await commitInSlices(`/api/admin/import-review/${batchId}/rows/act`, body, (sum) =>
          setResult({ tone: "good", text: `Committing… ${sum.committed.toLocaleString()} row(s) in the catalog so far.` })
        );
        setResult(commitSummary(total, "merged into existing items"));
        setSelected(new Set());
        refresh();
        return;
      }
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ tone: "critical", text: data.error ?? "That didn't work. Try again." });
        return;
      }
      if (action === "park") {
        setResult({ tone: "good", text: `Sent ${data.parked} row(s) to Flagged Items.` });
      } else {
        setResult({ tone: "good", text: `Excluded ${data.excluded} row(s); they won't be imported.` });
      }
      setSelected(new Set());
      refresh();
    } catch {
      setResult({ tone: "critical", text: "Couldn't reach the server. Try again." });
    } finally {
      setPending(null);
    }
  }

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r._id));
  const scopeNote = q ? " matching your search" : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Where this file's rows are */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Waiting here", value: counts.total, hint: q ? "matching search" : `of ${counts.fileRows} in the file` },
          { label: "Flagged", value: counts.flagged, hint: "have an issue", tone: "text-warn" },
          {
            label: "In Flagged Items",
            value: counts.parked,
            hint: "being fixed",
            href: "/catalog/flagged",
          },
          { label: "In the catalog", value: counts.committed, hint: "committed", tone: "text-good" },
        ].map((c) => {
          const inner = (
            <>
              <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">{c.label}</div>
              <div className={`font-display text-[1.5rem] font-semibold leading-tight ${c.tone ?? "text-ink"}`}>
                {c.value.toLocaleString()}
              </div>
              <div className="text-[0.74rem] text-ink-faint">{c.hint}</div>
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-md border border-border bg-surface-raised px-4 py-3 no-underline hover:border-brass"
            >
              {inner}
            </Link>
          ) : (
            <div key={c.label} className="rounded-md border border-border bg-surface-raised px-4 py-3">
              {inner}
            </div>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="primary"
            disabled={!!busy || counts.unflagged === 0}
            loading={busy === "commit:unflagged"}
            onClick={() => act("commit", "unflagged")}
          >
            <span className="flex items-center gap-1.5">
              {busy !== "commit:unflagged" && <Database size={14} />}
              Commit {counts.unflagged.toLocaleString()} unflagged to Catalog
            </span>
          </Button>
          <Button
            disabled={!!busy || counts.flagged === 0}
            loading={busy === "park:flagged"}
            onClick={() => act("park", "flagged")}
          >
            <span className="flex items-center gap-1.5">
              {busy !== "park:flagged" && <Flag size={14} />}
              Send {counts.flagged.toLocaleString()} flagged to Flagged Items
            </span>
          </Button>
          <Button
            disabled={!!busy || counts.total === 0}
            loading={busy === "park:all"}
            onClick={() =>
              act(
                "park",
                "all",
                `Send all ${counts.total.toLocaleString()} row(s)${scopeNote} to Flagged Items? Nothing is added to the catalog yet.`
              )
            }
          >
            <span className="flex items-center gap-1.5">
              {busy !== "park:all" && <Send size={14} />}
              Send all {counts.total.toLocaleString()} to Flagged Items
            </span>
          </Button>
        </div>
        <p className="mt-3 mb-0 text-[0.8rem] text-ink-faint">
          Rows sent to <Link href="/catalog/flagged" className="text-brass no-underline">Flagged Items</Link> are
          kept there to be fixed and committed later.{q ? " Buttons act on the rows matching your search." : ""}
        </p>
        {result && (
          <p className={`mt-2.5 mb-0 text-[0.84rem] ${result.tone === "good" ? "text-good" : "text-critical"}`}>
            {result.text}
          </p>
        )}
      </Card>

      <Card>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
          <span className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="search"
              defaultValue={q}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(
                  () => router.push(`/catalog/import/${batchId}${v ? `?q=${encodeURIComponent(v)}` : ""}`),
                  350
                );
              }}
              placeholder="Find rows by SKU or title, then tick them to commit"
              className="font-body text-[0.88rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass"
            />
          </span>
        </label>
      </Card>

      {selected.size > 0 && (
        <Card className="!border-brass flex flex-wrap items-center gap-2.5">
          <span className="mr-1 text-[0.86rem] font-semibold">{selected.size} selected</span>
          <Button
            size="sm"
            variant="primary"
            disabled={!!busy}
            loading={busy === "commit:selected"}
            onClick={() => act("commit", "selected")}
          >
            <span className="flex items-center gap-1">
              {busy !== "commit:selected" && <Database size={13} />} Commit to Catalog
            </span>
          </Button>
          <Button size="sm" disabled={!!busy} loading={busy === "park:selected"} onClick={() => act("park", "selected")}>
            <span className="flex items-center gap-1">
              {busy !== "park:selected" && <Flag size={13} />} Send to Flagged Items
            </span>
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!!busy}
            loading={busy === "exclude:selected"}
            onClick={() => act("exclude", "selected", `Exclude ${selected.size} row(s)? They won't be imported.`)}
          >
            <span className="flex items-center gap-1">
              {busy !== "exclude:selected" && <XCircle size={13} />} Exclude
            </span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </Card>
      )}

      {counts.total === 0 ? (
        <Card>
          {q ? (
            <p className="m-0 text-[0.88rem] text-ink-faint">No waiting rows match &quot;{q}&quot;.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <CheckCircle2 size={18} className="text-good" />
              <span className="text-[0.9rem]">Every row of this file has been handled.</span>
              {counts.parked > 0 && (
                <Link
                  href="/catalog/flagged"
                  className="inline-flex items-center gap-1 text-[0.86rem] font-semibold text-brass no-underline"
                >
                  {counts.parked} still in Flagged Items <ArrowRight size={14} />
                </Link>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1000px]">
              <thead>
                <tr>
                  <th className="bg-surface-sunken px-4 py-2.5 border-b border-border-strong w-[40px]">
                    <input
                      type="checkbox"
                      aria-label="Select every row on this page"
                      checked={allOnPage}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r._id)) : new Set())}
                      className="w-4 h-4 accent-[var(--brass)]"
                    />
                  </th>
                  {["Row", "SKU", "Title", "Category", "Brand", "MSRP", "Issues"].map((h) => (
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
                  const isSel = selected.has(row._id);
                  return (
                    <tr key={row._id} className={`border-b border-border align-top ${isSel ? "bg-brass-bg" : ""}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.rowNumber}`}
                          checked={isSel}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(row._id)) next.delete(row._id);
                              else next.add(row._id);
                              return next;
                            })
                          }
                          className="w-4 h-4 accent-[var(--brass)]"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-[0.82rem] text-ink-faint">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold whitespace-nowrap">
                        {text(row.coerced.itemNumber)}
                      </td>
                      <td className="px-4 py-3 text-[0.83rem] max-w-[260px] truncate" title={text(row.coerced.title)}>
                        {text(row.coerced.title)}
                      </td>
                      <td className="px-4 py-3 text-[0.83rem] text-ink-soft">{text(row.coerced.category)}</td>
                      <td className="px-4 py-3 text-[0.83rem] text-ink-soft">{text(row.coerced.brand)}</td>
                      <td className="px-4 py-3 font-mono text-[0.82rem]">
                        {money(row.coerced["pricing.newMsrp"] ?? row.coerced["pricing.msrp"])}
                      </td>
                      <td className="px-4 py-3 max-w-[340px]">
                        {row.issues.length === 0 ? (
                          <span className="flex items-center gap-1.5 text-good text-[0.82rem]">
                            <CheckCircle2 size={13} /> none
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {row.issues.map((f, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-[0.79rem] text-warn">
                                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                                <span>
                                  <strong>{f.label}</strong>: {f.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.updates && (
                          <div className="text-[0.76rem] text-ink-faint mt-1">
                            {row.updates.inCatalog
                              ? `Updates ${row.updates.sku} in the catalog`
                              : `Updates un-verified item ${row.updates.sku} and adds it to the catalog`}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination page={page} total={counts.total} basePath={`/catalog/import/${batchId}`} query={{ q: q || undefined }} />
          </div>
        </Card>
      )}
    </div>
  );
}
