"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/Field";

export type CatalogFilterState = {
  q: string;
  category: string;
  brand: string;
  plating: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  tab: string; // the existing All / Incomplete / Pending / Variations tab
};

const SORTS: { value: string; label: string }[] = [
  { value: "sku", label: "SKU (A–Z)" },
  { value: "sku_desc", label: "SKU (Z–A)" },
  { value: "title", label: "Title (A–Z)" },
  { value: "brand", label: "Brand (A–Z)" },
  { value: "msrp_asc", label: "MSRP (low → high)" },
  { value: "msrp_desc", label: "MSRP (high → low)" },
  { value: "newest", label: "Recently updated" },
];

export function CatalogFilters({
  state,
  categories,
  brands,
  platings,
}: {
  state: CatalogFilterState;
  categories: string[];
  brands: string[];
  platings: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(state.q);

  // Follow the URL when it changes from outside the box (Clear, back/forward),
  // never while someone is typing: a late older search would wipe new letters.
  useEffect(() => {
    if (document.activeElement !== searchRef.current) setQ(state.q);
  }, [state.q]);
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function pushWith(next: Partial<CatalogFilterState>) {
    // A search still waiting to run goes along with this change; on its own it
    // would run later with the filters from before and undo this one.
    if (debounceRef.current && !("q" in next)) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      next = { ...next, q: searchRef.current?.value ?? q };
    }
    const merged = { ...state, ...next };
    const params = new URLSearchParams();
    if (merged.tab && merged.tab !== "all") params.set("filter", merged.tab);
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.category) params.set("category", merged.category);
    if (merged.brand) params.set("brand", merged.brand);
    if (merged.plating) params.set("plating", merged.plating);
    if (merged.minPrice) params.set("minPrice", merged.minPrice);
    if (merged.maxPrice) params.set("maxPrice", merged.maxPrice);
    if (merged.sort && merged.sort !== "sku") params.set("sort", merged.sort);
    // any field change resets to page 1 (page param simply omitted)
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      pushWith({ q: value });
    }, 350);
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setQ("");
    pushWith({ q: "", category: "", brand: "", plating: "", minPrice: "", maxPrice: "", sort: "sku" });
  }

  const hasActive =
    state.q || state.category || state.brand || state.plating || state.minPrice || state.maxPrice || state.sort !== "sku";

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <label className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
        <span className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="SKU, title, brand, UPC…"
            className="font-body text-[0.89rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]"
          />
        </span>
      </label>

      <label className="flex flex-col gap-1.5 w-[150px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Category</span>
        <Select value={state.category} onChange={(e) => pushWith({ category: e.target.value })}>
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5 w-[160px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Brand</span>
        <Select value={state.brand} onChange={(e) => pushWith({ brand: e.target.value })}>
          <option value="">All</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5 w-[170px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Plating</span>
        <Select value={state.plating} onChange={(e) => pushWith({ plating: e.target.value })}>
          <option value="">All</option>
          {platings.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1.5 w-[100px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Min $</span>
        <input
          key={`min-${state.minPrice}`}
          type="number"
          step="0.01"
          min="0"
          defaultValue={state.minPrice}
          onBlur={(e) => e.target.value !== state.minPrice && pushWith({ minPrice: e.target.value })}
          className="font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]"
        />
      </label>
      <label className="flex flex-col gap-1.5 w-[100px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Max $</span>
        <input
          key={`max-${state.maxPrice}`}
          type="number"
          step="0.01"
          min="0"
          defaultValue={state.maxPrice}
          onBlur={(e) => e.target.value !== state.maxPrice && pushWith({ maxPrice: e.target.value })}
          className="font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]"
        />
      </label>

      <label className="flex flex-col gap-1.5 w-[180px]">
        <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Sort by</span>
        <Select value={state.sort} onChange={(e) => pushWith({ sort: e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>

      {hasActive && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 text-[0.8rem] text-ink-soft hover:text-critical px-2 py-2.5"
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}
