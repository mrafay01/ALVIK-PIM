"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Go to page [__] of N": type a page number and press Enter (or Go).
// `hrefFor` isn't passed (functions can't cross from a server component),
// so the URL is rebuilt from the base path and query here.
export function PageJump({
  page,
  pageCount,
  basePath,
  query,
  onJump,
}: {
  page: number;
  pageCount: number;
  basePath?: string;
  query?: Record<string, string | undefined>;
  // For client-side tables that page in memory instead of by URL.
  onJump?: (page: number) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go() {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || value.trim() === "") return;
    const target = Math.min(Math.max(1, n), pageCount);
    setValue("");
    if (target === page) return;
    if (onJump) return onJump(target);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath ?? "");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex items-center gap-1.5 text-[0.82rem] text-ink-faint"
    >
      <label htmlFor="page-jump">Go to page</label>
      <input
        id="page-jump"
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={String(page)}
        className="w-[72px] font-mono text-[0.82rem] px-2 py-1.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass"
      />
      <span>of {pageCount.toLocaleString()}</span>
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-2.5 py-1.5 rounded-sm border border-border-strong text-ink-soft bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default hover:enabled:border-brass hover:enabled:text-brass"
      >
        Go
      </button>
    </form>
  );
}
