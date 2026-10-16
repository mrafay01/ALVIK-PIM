// Fields the catalog treats as authoritative — a divergent value in an
// incoming PI row triggers a CatalogConflict rather than silently
// overwriting the stored value. Agreed with Joel on 2026-10-12:
// weights, physical measurements, and vendor SKU.
//
// What's deliberately NOT here:
//   - pricing fields (already append-only on items.pricingHistory, so
//     divergence is modeled as history rather than conflict)
//   - stone info / plating / colors (change legitimately with new
//     designs; reviewer-visible but non-blocking)
//   - category/brand/title/description (listing content, not fact
//     about the physical item)

export type AuthoritativeFieldKind = "weight" | "number" | "text";

export interface AuthoritativeField {
  /** Dot-path on the Item document */
  path: string;
  /** Human-readable label for the review UI and the change log */
  label: string;
  kind: AuthoritativeFieldKind;
}

export const AUTHORITATIVE_FIELDS: AuthoritativeField[] = [
  { path: "specs.weight.totalG", label: "Total weight (g)", kind: "weight" },
  { path: "specs.weight.silverG", label: "Silver weight (g)", kind: "weight" },
  { path: "vendorSku", label: "Vendor item #", kind: "text" },
  { path: "specs.ringSize", label: "Ring size", kind: "text" },
  { path: "specs.chainLength", label: "Chain length", kind: "text" },
  { path: "specs.itemSize", label: "Item size", kind: "text" },
  { path: "specs.thickness", label: "Chain thickness", kind: "text" },
  { path: "specs.lengthBrNec", label: "Length (BR/NEC)", kind: "text" },
  { path: "specs.extenderBrNec", label: "Extender size (BR/NEC)", kind: "text" },
  { path: "specs.postLength", label: "Post length", kind: "text" },
  { path: "specs.pushBackSize", label: "Push-back size", kind: "text" },
];

export const AUTHORITATIVE_FIELD_BY_PATH: Record<string, AuthoritativeField> =
  Object.fromEntries(AUTHORITATIVE_FIELDS.map((f) => [f.path, f]));

export function isAuthoritativePath(path: string): boolean {
  return path in AUTHORITATIVE_FIELD_BY_PATH;
}

// Weight comparison: both sides rounded to 2dp before equality, so
// floating-point noise (10.19999999 vs 10.2) doesn't flag. Text
// compared with trimmed strict equality; empty string / null / undefined
// collapse to "no value" so the common case of a PI that omits a field
// doesn't look like a conflict against a filled-in catalog record.
export function valuesConflict(
  kind: AuthoritativeFieldKind,
  catalogValue: unknown,
  incomingValue: unknown
): boolean {
  if (isEmpty(incomingValue)) return false;
  if (isEmpty(catalogValue)) return false;

  if (kind === "weight" || kind === "number") {
    const a = Number(catalogValue);
    const b = Number(incomingValue);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const dp = kind === "weight" ? 2 : 6;
    const factor = Math.pow(10, dp);
    return Math.round(a * factor) !== Math.round(b * factor);
  }

  const a = String(catalogValue).trim();
  const b = String(incomingValue).trim();
  return a !== b;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

// Reads a dot-path from a plain object. Mirrors Mongoose's own path
// access without importing the full ODM into a shared util module.
export function getByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}
