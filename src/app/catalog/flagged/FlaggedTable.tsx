"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, Search, TriangleAlert, Undo2, XCircle, Wand2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input } from "@/components/ui/Field";
import { Pagination } from "@/components/app/Pagination";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";
import { commitInSlices, commitSummary } from "@/lib/client/commitInSlices";
import { KNOWN_METALS } from "@/lib/import/metals";

export type IssueOption = { field: string; label: string; summary: string; rows: number; kind: string };

export type FlaggedRow = {
  _id: string;
  batchId: string;
  fileName: string;
  rowNumber: number;
  coerced: Record<string, unknown>;
  flags: { field: string; label: string; message: string; rawValue: string }[];
  // An item with this SKU already exists: committing updates it.
  updates: { sku: string; inCatalog: boolean } | null;
};

type Action = "commit" | "return" | "exclude";
type Scope = "fixed" | "filtered" | "selected";

const KIND_HINT: Record<string, string> = {
  number: "a number, e.g. 42.50",
  weight: "a number in grams, e.g. 3.2",
  date: "a date, e.g. 2026-10-20 or 10/20/2026",
  metal: `${KNOWN_METALS.slice(0, -1).join(", ")} or ${KNOWN_METALS[KNOWN_METALS.length - 1]}`,
  bool: "any text marks it as yes",
  text: "text",
};

function text(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

export function FlaggedTable({
  rows,
  page,
  q,
  issue,
  issues,
  counts,
}: {
  rows: FlaggedRow[];
  page: number;
  q: string;
  issue: string;
  issues: IssueOption[];
  counts: { total: number; all: number; fixed: number };
}) {
  const router = useRouter();
  const { refresh, refreshing } = useRefreshAfterSave();
  const [pending, setPending] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const busy = pending ?? (refreshing ? last : null);
  const [result, setResult] = useState<{ tone: "good" | "critical"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkValue, setBulkValue] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rowKey = rows.map((r) => r._id).join(",");
  useEffect(() => setSelected(new Set()), [rowKey]);
  useEffect(() => setBulkValue(""), [issue]);

  const currentIssue = issues.find((i) => i.field === issue);
  const canBulkSet = !!currentIssue && currentIssue.field !== "itemNumber";

  function navigate(next: { q?: string; issue?: string }) {
    // A search still waiting to run goes along with this change; on its own
    // it would run later with the old issue filter and undo this one.
    if (timer.current && next.q === undefined) {
      clearTimeout(timer.current);
      next = { ...next, q: (searchRef.current?.value ?? "").trim() };
    }
    timer.current = null;
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    const ni = next.issue ?? issue;
    if (nq) sp.set("q", nq);
    if (ni) sp.set("issue", ni);
    const s = sp.toString();
    router.push(`/catalog/flagged${s ? `?${s}` : ""}`);
  }

  async function run(key: string, task: () => Promise<{ tone: "good" | "critical"; text: string } | null>) {
    setPending(key);
    setLast(key);
    setResult(null);
    try {
      const r = await task();
      if (r) setResult(r);
      refresh();
    } catch {
      setResult({ tone: "critical", text: "Couldn't reach the server. Try again." });
    } finally {
      setPending(null);
    }
  }

  function act(action: Action, scope: Scope, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    return run(`${action}:${scope}`, async () => {
      const body = {
        action,
        scope,
        q: q || undefined,
        issue: scope === "filtered" && issue !== "__fixed" ? issue || undefined : undefined,
        rowIds: scope === "selected" ? [...selected] : undefined,
      };
      if (action === "commit") {
        // Many rows are committed over several calls (~40 s each): each
        // returns `next` until every row has been tried.
        const total = await commitInSlices("/api/admin/flagged-items/act", body, (sum) =>
          setResult({ tone: "good", text: `Committing… ${sum.committed.toLocaleString()} row(s) in the catalog so far.` })
        );
        setSelected(new Set());
        return commitSummary(total, "merged");
      }
      const res = await fetch("/api/admin/flagged-items/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { tone: "critical", text: data.error ?? "That didn't work." };
      setSelected(new Set());
      return {
        tone: "good",
        text: action === "return" ? `Sent ${data.affected} row(s) back to their review page.` : `Excluded ${data.affected} row(s).`,
      };
    });
  }

  function setValueForAll(scope: "filtered" | "selected") {
    if (!currentIssue) return;
    const n = scope === "selected" ? selected.size : counts.total;
    if (!window.confirm(`Set ${currentIssue.label} to "${bulkValue}" on ${n} row(s)?`)) return;
    return run(`set:${scope}`, async () => {
      const res = await fetch("/api/admin/flagged-items/set-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: currentIssue.field,
          value: bulkValue,
          scope,
          q: q || undefined,
          rowIds: scope === "selected" ? [...selected] : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { tone: "critical", text: data.error ?? "That didn't work." };
      return data.stillFlagged > 0
        ? { tone: "critical", text: data.message ?? `${data.stillFlagged} row(s) are still flagged.` }
        : { tone: "good", text: `Set ${currentIssue.label} on ${data.updated} row(s); their issue is cleared.` };
    });
  }

  function fixOne(row: FlaggedRow, field: string, value: string) {
    return run(`edit:${row._id}`, async () => {
      const res = await fetch(`/api/admin/import-review/${row.batchId}/rows/${row._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coercedOverrides: { [field]: value } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { tone: "critical", text: data.error ?? "Couldn't save that value." };
      return null;
    });
  }

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r._id));

  if (counts.all === 0 && !q) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={20} className="text-good" />
          <div>
            <div className="font-semibold text-[0.92rem]">Nothing flagged</div>
            <div className="text-[0.84rem] text-ink-soft">
              Rows land here when you send them from a Master File import&apos;s review.{" "}
              <Link href="/catalog/import" className="text-brass no-underline">
                Go to imports
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter + search */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 w-[340px] max-w-full">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Issue</span>
            <Select value={issue} onChange={(e) => navigate({ issue: e.target.value })}>
              <option value="">All rows ({counts.all.toLocaleString()})</option>
              {issues.map((i) => (
                <option key={i.field} value={i.field}>
                  {i.label}: {i.summary} ({i.rows.toLocaleString()})
                </option>
              ))}
              <option value="__fixed">No issues left, ready to commit ({counts.fixed.toLocaleString()})</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                ref={searchRef}
                type="search"
                defaultValue={q}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => navigate({ q: v }), 350);
                }}
                placeholder="SKU or title…"
                className="font-body text-[0.88rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass"
              />
            </span>
          </label>
        </div>

        {/* One value for every row with this issue */}
        {canBulkSet && currentIssue && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1.5 w-[260px]">
              <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">
                Set {currentIssue.label} on these rows
              </span>
              <Input
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={KIND_HINT[currentIssue.kind] ?? "value"}
              />
            </label>
            <Button
              variant="primary"
              disabled={!bulkValue.trim() || !!busy}
              loading={busy === "set:filtered"}
              onClick={() => setValueForAll("filtered")}
            >
              <span className="flex items-center gap-1.5">
                {busy !== "set:filtered" && <Wand2 size={14} />} Apply to all {counts.total.toLocaleString()}
              </span>
            </Button>
            {selected.size > 0 && (
              <Button
                disabled={!bulkValue.trim() || !!busy}
                loading={busy === "set:selected"}
                onClick={() => setValueForAll("selected")}
              >
                Apply to {selected.size} selected
              </Button>
            )}
            <span className="text-[0.78rem] text-ink-faint pb-2.5">Expected: {KIND_HINT[currentIssue.kind] ?? "text"}</span>
          </div>
        )}
        {currentIssue?.field === "itemNumber" && (
          <p className="mt-3 mb-0 text-[0.8rem] text-ink-faint">
            Each row needs its own SKU, so type it on each row below.
          </p>
        )}
      </Card>

      {/* Actions */}
      <Card className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="primary"
          disabled={!!busy || counts.fixed === 0}
          loading={busy === "commit:fixed"}
          onClick={() => act("commit", "fixed")}
        >
          <span className="flex items-center gap-1.5">
            {busy !== "commit:fixed" && <Database size={14} />} Commit {counts.fixed.toLocaleString()} fixed row(s) to
            Catalog
          </span>
        </Button>
        {selected.size > 0 && (
          <>
            <span className="mx-1 text-[0.84rem] font-semibold">{selected.size} selected:</span>
            <Button
              size="sm"
              disabled={!!busy}
              loading={busy === "commit:selected"}
              onClick={() => {
                const stillFlagged = rows.filter((r) => selected.has(r._id) && r.flags.length > 0).length;
                act(
                  "commit",
                  "selected",
                  stillFlagged > 0
                    ? `${stillFlagged} of the selected rows still have issues; their flagged values won't be imported. Commit anyway?`
                    : undefined
                );
              }}
            >
              Commit to Catalog
            </Button>
            <Button size="sm" disabled={!!busy} loading={busy === "return:selected"} onClick={() => act("return", "selected")}>
              <span className="flex items-center gap-1">
                {busy !== "return:selected" && <Undo2 size={13} />} Back to review
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
              Clear
            </Button>
          </>
        )}
        {busy?.startsWith("edit:") && (
          <span className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-soft">
            <Loader2 size={13} className="animate-spin" /> Saving…
          </span>
        )}
        {result && (
          <span className={`w-full text-[0.84rem] ${result.tone === "good" ? "text-good" : "text-critical"}`}>
            {result.text}
          </span>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="m-0 text-[0.88rem] text-ink-faint">No rows match.</p>
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
                  {["SKU", "Title", "From", "Issues (fix and press Enter)"].map((h) => (
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
                          aria-label={`Select ${text(row.coerced.itemNumber)}`}
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
                      <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold whitespace-nowrap">
                        {text(row.coerced.itemNumber)}
                      </td>
                      <td className="px-4 py-3 text-[0.83rem] max-w-[240px] truncate" title={text(row.coerced.title)}>
                        {text(row.coerced.title)}
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] text-ink-faint whitespace-nowrap">
                        <span className="text-ink-soft">{row.fileName}</span>
                        <div>row {row.rowNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        {row.updates && (
                          <div className="text-[0.76rem] text-ink-faint mb-1.5">
                            {row.updates.inCatalog
                              ? `Updates ${row.updates.sku} in the catalog`
                              : `Updates un-verified item ${row.updates.sku} and adds it to the catalog`}
                          </div>
                        )}
                        {row.flags.length === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-good">
                            <CheckCircle2 size={13} /> Ready to commit
                          </span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {row.flags.map((f) => (
                              <div key={f.field} className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[0.79rem] text-warn min-w-[220px]">
                                  <TriangleAlert size={12} className="shrink-0" />
                                  <span>
                                    <strong>{f.label}</strong>: {f.message}
                                  </span>
                                </span>
                                <Input
                                  defaultValue={
                                    f.field === "itemNumber" ? "" : String(row.coerced[f.field] ?? f.rawValue ?? "")
                                  }
                                  placeholder={f.field === "itemNumber" ? "Type the SKU" : "Correct value"}
                                  disabled={busy === `edit:${row._id}`}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  }}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    const before = f.field === "itemNumber" ? "" : String(row.coerced[f.field] ?? f.rawValue ?? "");
                                    if (v && v !== before) void fixOne(row, f.field, v);
                                  }}
                                  className="!w-[180px] !py-1.5"
                                />
                              </div>
                            ))}
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
            <Pagination
              page={page}
              total={counts.total}
              basePath="/catalog/flagged"
              query={{ q: q || undefined, issue: issue || undefined }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
