"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert, CheckCircle2, Shield } from "lucide-react";

export function CatalogRowFlags({
  itemId,
  missing,
  pending,
  canApprove,
  conflictCount = 0,
}: {
  itemId: string;
  missing: string[];
  pending: boolean;
  canApprove: boolean;
  /** Number of unresolved CatalogConflict docs on this item. Rendered as a
   *  warn pill linking to the item-filtered conflicts page so a reviewer
   *  jumps straight to the resolver without scanning /catalog/conflicts. */
  conflictCount?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function approve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/catalog/${itemId}/approve`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative flex items-center justify-end gap-2">
      {conflictCount > 0 && (
        <Link
          href={`/catalog/conflicts?itemId=${itemId}`}
          className="inline-flex items-center gap-1 font-mono text-[0.68rem] font-semibold tracking-wide px-2 py-1 rounded-full bg-warn-bg text-warn whitespace-nowrap no-underline hover:brightness-110"
          title={`${conflictCount} unresolved PI conflict${conflictCount === 1 ? "" : "s"} — click to review`}
        >
          <Shield size={10} /> {conflictCount}
        </Link>
      )}
      {pending && (
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] font-semibold tracking-wide px-2 py-1 rounded-full bg-warn-bg text-warn whitespace-nowrap">
          Pending
        </span>
      )}
      {pending && canApprove && (
        <button
          type="button"
          onClick={approve}
          disabled={busy}
          className="text-[0.75rem] font-semibold px-2.5 py-1 rounded-sm border border-good-bg bg-good-bg text-good hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "…" : "Approve"}
        </button>
      )}

      {missing.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`${missing.length} missing field${missing.length === 1 ? "" : "s"}`}
          className="text-warn hover:text-critical p-0.5"
        >
          <TriangleAlert size={16} />
        </button>
      ) : (
        <CheckCircle2 size={15} className="text-good/50" />
      )}

      {open && missing.length > 0 && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[240px] rounded-md border border-border-strong bg-surface-raised shadow-lg p-3 text-left">
          <div className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-wide mb-1.5">
            Missing to complete
          </div>
          <ul className="m-0 pl-0 list-none flex flex-col gap-1">
            {missing.map((m, i) => (
              <li key={i} className="text-[0.8rem] text-ink-soft flex items-start gap-1.5">
                <TriangleAlert size={12} className="mt-0.5 shrink-0 text-warn" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
