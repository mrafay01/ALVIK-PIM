import type { ItemMeasurements } from "@/lib/measurements/types";

// Shared shape for a single variation row, used by both the "New catalog
// item" form (which hands off to the dedicated Variations screen) and that
// screen itself. Kept here rather than duplicated so the two screens can
// never drift out of sync on what fields a variation carries.
//
// Deliberately absent: msrp, category, brand, gender, metal — these are
// always inherited from the base item, never overridden per variation
// (see POST /api/catalog and the Variations screen's own UI, which shows
// them read-only for exactly this reason). `measurements` IS per-variation
// (a ring-size or dimension can genuinely differ between platings/sizes)
// — it starts as a copy of the base item's measurements when the row is
// created, and the user edits it from there; falls back to the base
// item's measurements server-side if left completely unset.
export type VariationDraft = {
  suffix: string;
  // When set, this variation uses its own SKU instead of the default
  // "{baseSku}-{suffix}" — the rare "different SKU family" case.
  independentSku: string;
  title: string;
  description: string;
  plating: string;
  upc: string;
  upc2: string;
  aliasSku: string;
  totalWeight: string;
  silverWeight: string;
  mainStoneInfo: string;
  mainStoneColor: string;
  mainStoneType: string;
  restStoneInfo: string;
  restStoneColor: string;
  restStoneType: string;
  stoneSetting: string;
  pearlSize: string;
  pearlType: string;
  clasp: string;
  measurements: ItemMeasurements;
};

export function emptyVariationDraft(baseMeasurements: ItemMeasurements = {}): VariationDraft {
  return {
    suffix: "",
    independentSku: "",
    title: "",
    description: "",
    plating: "",
    upc: "",
    upc2: "",
    aliasSku: "",
    totalWeight: "",
    silverWeight: "",
    mainStoneInfo: "",
    mainStoneColor: "",
    mainStoneType: "",
    restStoneInfo: "",
    restStoneColor: "",
    restStoneType: "",
    stoneSetting: "",
    pearlSize: "",
    pearlType: "",
    clasp: "",
    // Deep-ish copy so editing this row's measurements never mutates the
    // base draft (or another row's) via a shared object reference.
    measurements: structuredCloneMeasurements(baseMeasurements),
  };
}

export function structuredCloneMeasurements(m: ItemMeasurements): ItemMeasurements {
  return {
    ...m,
    values: m.values ? { ...m.values } : undefined,
    ringSize: m.ringSize ? { ...m.ringSize } : undefined,
    stones: m.stones ? { ...m.stones } : undefined,
  };
}

// The base-item fields a variation needs to know about for display/
// inheritance purposes on the Variations screen (read-only there).
export type VariationBaseContext = {
  sku: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  gender: string;
  metal: string;
  plating: string;
  msrp: string;
  measurements: ItemMeasurements;
};

function str(s: string): string | undefined {
  return s.trim() || undefined;
}
function num(s: string): number | undefined {
  return s.trim() ? Number(s) : undefined;
}

// True when a variation's measurements have actually been edited away from
// the base item's — used to show a "differs from base" badge and to avoid
// sending a redundant identical `measurements` object on every row.
export function measurementsDifferFromBase(v: ItemMeasurements, base: ItemMeasurements): boolean {
  return JSON.stringify(cleanForCompare(v)) !== JSON.stringify(cleanForCompare(base));
}

function cleanForCompare(m: ItemMeasurements): ItemMeasurements {
  const c = structuredCloneMeasurements(m);
  delete c.category;
  return c;
}

// Builds the exact payload shape CatalogVariationSchema expects from one
// draft row. Returns null for a row with no suffix (incomplete/placeholder
// row a user added but never filled in) so callers can filter those out.
export function draftToPayload(
  v: VariationDraft,
  baseMeasurements: ItemMeasurements
): Record<string, unknown> | null {
  if (!v.suffix.trim()) return null;
  return {
    suffix: v.suffix.trim(),
    independentSku: str(v.independentSku),
    title: str(v.title),
    description: str(v.description),
    plating: str(v.plating),
    upc: str(v.upc),
    upc2: str(v.upc2),
    aliasSku: str(v.aliasSku),
    totalWeight: num(v.totalWeight),
    silverWeight: num(v.silverWeight),
    mainStoneInfo: str(v.mainStoneInfo),
    mainStoneColor: str(v.mainStoneColor),
    mainStoneType: str(v.mainStoneType),
    restStoneInfo: str(v.restStoneInfo),
    restStoneColor: str(v.restStoneColor),
    restStoneType: str(v.restStoneType),
    stoneSetting: str(v.stoneSetting),
    pearlSize: str(v.pearlSize),
    pearlType: str(v.pearlType),
    clasp: str(v.clasp),
    // Only sent when actually different from the base — keeps the payload
    // small for the common case where every variation shares the base
    // item's measurements, and lets the API's "fall back to base" logic
    // apply cleanly.
    measurements: measurementsDifferFromBase(v.measurements, baseMeasurements)
      ? v.measurements
      : undefined,
  };
}

// Computes the SKU that will actually be used for display purposes, given
// the base SKU and whether an independent SKU is set.
export function resolvedVariationSku(baseSku: string, v: VariationDraft): string {
  if (v.independentSku.trim()) return v.independentSku.trim();
  return `${baseSku || "SKU"}-${v.suffix || "…"}`;
}
