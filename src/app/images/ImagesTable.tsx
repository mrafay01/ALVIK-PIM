"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageSubfolder } from "@/lib/enums";
import { useRouter, usePathname } from "next/navigation";
import { CheckCircle2, Circle, Link2Off, Search, Upload, ShieldCheck, X, ImagePlus, Film } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Pagination } from "@/components/app/Pagination";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";
import { uploadItemImage, type ItemMediaEntry, type UploadKind } from "@/lib/client/uploadItemImage";
import { MEDIA_KIND_LABEL, MEDIA_UPLOAD_OPTIONS, acceptFor, exampleNameFor } from "@/lib/items/mediaKinds";

export type ImageRow = {
  _id: string;
  sku: string;
  // The SharePoint folder / file-name form of the SKU (lib/items/images mediaFolderKey).
  folderKey: string;
  isSample: boolean;
  title: string | null;
  inCatalog: boolean;
  media: ItemMediaEntry[];
};

type State = { scope: string; status: string; q: string; sort: string };
type Kind = ImageSubfolder;

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing images" },
  { value: "none", label: "No images" },
  { value: "broken", label: "Broken links" },
  { value: "complete", label: "Complete" },
];

// Table columns, in folder order. Lifestyle and video are optional and
// don't count towards "complete".
const KIND_COLUMNS: Kind[] = ["main", "sides", "models", "lifestyle", "videos"];

function fileName(m: ItemMediaEntry): string {
  if (m.name) return m.name;
  const last = m.url.split("?")[0].split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

const POPOVER_WIDTH = 260;
const POPOVER_GAP = 4;
const VIEWPORT_MARGIN = 8;

// One cell per image type: green with a count when the links work, red when
// any is broken, grey "None" when there's nothing. Each image opens in
// SharePoint from the popover list.
//
// The popover is rendered into <body> with fixed positioning: the table sits
// in an overflow-x-auto box, which clips anything that sticks out of it, so a
// popover inside the cell was cut off on the last rows. It opens below the
// badge, or above it when there isn't room below, and follows the badge when
// the page or the table scrolls.
function KindCell({ media, kind }: { media: ItemMediaEntry[]; kind: Kind }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const list = media.filter((m) => m.subfolder === kind);

  // Place the popover next to the badge, kept inside the window.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const btn = buttonRef.current?.getBoundingClientRect();
      if (!btn) return;
      const height = popRef.current?.offsetHeight ?? 0;
      const below = btn.bottom + POPOVER_GAP;
      const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN;
      const above = btn.top - POPOVER_GAP - height;
      const top = fitsBelow || above < VIEWPORT_MARGIN ? below : above;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(btn.left, maxLeft));
      setPos({ top, left });
    }
    place();
    // A second pass once the popover has rendered and has a real height.
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Close on a click anywhere outside the badge and the popover, or Esc.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const broken = list.filter((m) => m.linkStatus === "broken").length;
  const ok = list.length - broken;
  if (list.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-ink-faint">
        <Circle size={13} /> None
      </span>
    );
  }
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 text-[0.8rem] font-semibold px-2 py-1 rounded-sm border-0 cursor-pointer ${
          broken > 0 ? "bg-critical-bg text-critical" : "bg-good-bg text-good"
        }`}
      >
        {broken > 0 ? <Link2Off size={12} /> : <CheckCircle2 size={12} />}
        {ok > 0 && `${ok} ok`}
        {ok > 0 && broken > 0 && " · "}
        {broken > 0 && `${broken} broken`}
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={`${MEDIA_KIND_LABEL[kind]} files`}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: POPOVER_WIDTH,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-50 max-h-[60vh] overflow-y-auto rounded-md border border-border-strong bg-surface-raised shadow-lg p-2.5"
        >
          {list.map((m) =>
            m.linkStatus === "broken" ? (
              <div key={m.sharePointItemId} className="flex items-center gap-1.5 text-[0.78rem] text-critical py-1">
                <Link2Off size={12} className="shrink-0" />
                <span className="font-mono truncate">{fileName(m)}</span>
              </div>
            ) : (
              <a
                key={m.sharePointItemId}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[0.78rem] text-brass no-underline py-1"
              >
                <CheckCircle2 size={12} className="shrink-0" />
                <span className="font-mono truncate">{fileName(m)}</span>
              </a>
            )
          )}
          {broken > 0 && (
            <p className="text-[0.72rem] text-ink-faint mt-1.5 mb-0">
              Broken means the file was deleted or moved in SharePoint. Upload it again to fix it.
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function UploadPanel({ row, onDone }: { row: ImageRow; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<UploadKind>("main");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setBusy(true);
    setErrors([]);
    const errs: string[] = [];
    for (const [i, f] of list.entries()) {
      try {
        await uploadItemImage(row._id, f, kind, (p) =>
          setProgress(`Uploading ${list.length > 1 ? `${i + 1} of ${list.length}` : f.name}… ${Math.round(p * 100)}%`)
        );
      } catch (err) {
        errs.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBusy(false);
    setProgress(null);
    setErrors(errs);
    if (inputRef.current) inputRef.current.value = "";
    if (errs.length < list.length) onDone();
  }

  const example = kind === "auto" ? "" : exampleNameFor(row.folderKey, kind);

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 bg-surface-sunken border-t border-border">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[0.82rem] font-semibold">Upload for {row.sku} as</span>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as UploadKind)}
          disabled={busy}
          className="!py-1.5 !w-[190px] !text-[0.82rem]"
        >
          {MEDIA_UPLOAD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="auto">Use the file names</option>
        </Select>
        <Button size="sm" variant="primary" loading={busy} onClick={() => inputRef.current?.click()}>
          <span className="flex items-center gap-1.5">
            {!busy && (kind === "videos" ? <Film size={13} /> : <ImagePlus size={13} />)}{" "}
            {busy
              ? "Uploading…"
              : kind === "main"
                ? "Choose image"
                : kind === "videos"
                  ? "Choose videos"
                  : kind === "auto"
                    ? "Choose files"
                    : "Choose images"}
          </span>
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={acceptFor(kind)}
          multiple={kind !== "main"}
          hidden
          onChange={(e) => upload(e.target.files)}
        />
        {progress && <span className="text-[0.8rem] text-ink-soft">{progress}</span>}
      </div>
      <p className="text-[0.76rem] text-ink-faint m-0">
        {kind === "auto"
          ? `Files must already be named ${row.folderKey}.jpg / ${row.folderKey}-S1.jpg / ${row.folderKey}-M1.jpg / ${row.folderKey}-LS1.jpg / ${row.folderKey}-V1.mp4.`
          : `Saved to SharePoint Images/${row.folderKey}/${kind === "videos" ? "Videos" : MEDIA_KIND_LABEL[kind]} as ${example}${
              kind === "main" ? " (replaces the current main image)" : kind === "videos" ? ". Videos up to 1 GB" : ""
            }.`}
      </p>
      {errors.map((e) => (
        <p key={e} className="text-[0.8rem] text-critical m-0">
          {e}
        </p>
      ))}
    </div>
  );
}

export function ImagesTable({
  rows,
  total,
  page,
  state,
  statusCounts,
  canUpload,
  lastCheckedAt,
}: {
  rows: ImageRow[];
  total: number;
  page: number;
  state: State;
  statusCounts: Record<string, number>;
  canUpload: boolean;
  lastCheckedAt: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { refresh, refreshing } = useRefreshAfterSave();
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function go(next: Partial<State>) {
    const m = { ...state, ...next };
    const sp = new URLSearchParams();
    if (m.scope !== "all") sp.set("scope", m.scope);
    if (m.status !== "all") sp.set("status", m.status);
    if (m.q) sp.set("q", m.q);
    if (m.sort !== "sku") sp.set("sort", m.sort);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function check(key: string, itemIds?: string[]) {
    setChecking(key);
    setError(null);
    setCheckNote(null);
    stopRef.current = false;
    let files = 0;
    let broken = 0;
    try {
      for (;;) {
        const res = await fetch("/api/images/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(itemIds ? { itemIds } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Check failed (${res.status})`);
        files += data.checkedFiles;
        broken += data.broken;
        setCheckNote(
          `Checked ${files} link${files === 1 ? "" : "s"}${broken ? `, ${broken} broken` : ", all working"}` +
            (!itemIds && data.remaining > 0 ? ` · ${data.remaining} item(s) left…` : ".")
        );
        if (itemIds || data.remaining === 0 || data.checkedFiles === 0 || stopRef.current) break;
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(null);
    }
  }

  const pageIds = rows.filter((r) => r.media.length > 0).map((r) => r._id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((t) => {
          const active = state.status === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => go({ status: t.value })}
              className={`px-3.5 py-1.5 rounded-full text-[0.82rem] border-0 cursor-pointer ${
                active
                  ? t.value === "broken"
                    ? "font-semibold bg-critical-bg text-critical"
                    : "font-semibold bg-brass-bg text-brass"
                  : "font-medium bg-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label} <span className="font-mono text-[0.75rem] opacity-75">{statusCounts[t.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="search"
                defaultValue={state.q}
                onChange={(e) => {
                  const v = e.target.value;
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => go({ q: v.trim() }), 350);
                }}
                placeholder="SKU or title…"
                className="font-body text-[0.88rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 w-[170px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Items</span>
            <Select value={state.scope} onChange={(e) => go({ scope: e.target.value })}>
              <option value="all">All items</option>
              <option value="catalog">Catalog</option>
              <option value="unverified">Un-verified</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[170px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Sort by</span>
            <Select value={state.sort} onChange={(e) => go({ sort: e.target.value })}>
              <option value="sku">SKU</option>
              <option value="updated">Recently updated</option>
            </Select>
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              disabled={!!checking || pageIds.length === 0}
              loading={checking === "page"}
              onClick={() => check("page", pageIds)}
            >
              <span className="flex items-center gap-1.5">
                {checking !== "page" && <ShieldCheck size={13} />} Check this page
              </span>
            </Button>
            {checking === "all" ? (
              <Button size="sm" variant="secondary" onClick={() => (stopRef.current = true)}>
                Stop checking
              </Button>
            ) : (
              <Button size="sm" variant="primary" disabled={!!checking} onClick={() => check("all")}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Check all links
                </span>
              </Button>
            )}
          </div>
        </div>
        <div className="text-[0.78rem] text-ink-faint mt-3">
          {checkNote ? (
            <span className="text-ink-soft">{checkNote}</span>
          ) : lastCheckedAt ? (
            `Links last checked ${new Date(lastCheckedAt).toLocaleString()}. "Check all" re-checks anything not checked in the last 24 hours.`
          ) : (
            "Links haven't been checked yet. \"Check all links\" verifies every image and video against SharePoint."
          )}
          {error && <span className="text-critical ml-2">{error}</span>}
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No items match these filters.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[960px]">
              <thead>
                <tr>
                  {["SKU", "Title", "Main", "Sides", "Models", "Lifestyle (optional)", "Video (optional)", ""].map((h, i) => (
                    <th
                      key={i}
                      className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row._id}>
                    <tr className={`border-b border-border ${refreshing ? "opacity-80" : ""}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/items/${row._id}`}
                          className="font-mono font-semibold text-[0.84rem] text-navy-deep no-underline"
                        >
                          {row.sku}
                        </Link>
                        <div className="text-[0.7rem] text-ink-faint">
                          {row.isSample ? "sample SKU" : row.inCatalog ? "catalog" : "un-verified"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[0.84rem] text-ink-soft max-w-[300px] truncate" title={row.title ?? undefined}>
                        {row.title ?? "—"}
                      </td>
                      {KIND_COLUMNS.map((k) => (
                        <td key={k} className="px-4 py-3">
                          <KindCell media={row.media} kind={k} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.media.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!!checking}
                              loading={checking === row._id}
                              onClick={() => check(row._id, [row._id])}
                            >
                              Check
                            </Button>
                          )}
                          {canUpload && (
                            <Button
                              size="sm"
                              variant={uploadingFor === row._id ? "secondary" : "primary"}
                              onClick={() => setUploadingFor(uploadingFor === row._id ? null : row._id)}
                            >
                              <span className="flex items-center gap-1.5">
                                {uploadingFor === row._id ? <X size={13} /> : <Upload size={13} />}
                                {uploadingFor === row._id ? "Close" : "Upload"}
                              </span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {uploadingFor === row._id && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <UploadPanel row={row} onDone={refresh} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination
              page={page}
              total={total}
              basePath="/images"
              query={{
                scope: state.scope === "all" ? undefined : state.scope,
                status: state.status === "all" ? undefined : state.status,
                q: state.q || undefined,
                sort: state.sort === "sku" ? undefined : state.sort,
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
