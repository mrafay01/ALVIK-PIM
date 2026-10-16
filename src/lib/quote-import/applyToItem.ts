import { QUOTE_FIELD_BY_KEY } from "./fields";
import { CUSTOM_KEY } from "./parseQuoteFile";

// coerced-key -> field on a pricingHistory entry. These don't go on the
// Item document directly — they're folded into one history entry per row.
const PRICING_KEYS: Record<string, string> = {
  price: "msrp",
  totalPrice: "totalPrice",
  confirmationDate: "effectiveDate",
};

// Keys that would mutate the prototype chain of every object in the
// process if used as a target key. All paths handed to deepSet come from
// static code (QUOTE_FIELD_BY_KEY), so none of these can appear in
// practice — this guard is defence-in-depth against a future accidental
// path and a documented stop sign for anyone adding dynamic paths later.
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// Sets `value` at a dot-path on `target`, creating intermediate objects but
// never replacing an existing one — so writing `specs.ringSize` onto an
// item that already has `specs.weight` keeps the weight. (setDotPath in
// src/lib/import builds a fresh nested object, which is fine when it's then
// spread onto a doc wholesale but wipes siblings when the path is only
// partial — this is the merge-safe version for that case.)
function deepSet(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  for (const p of parts) if (UNSAFE_KEYS.has(p)) return;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cursor[key];
    if (typeof next !== "object" || next === null) cursor[key] = Object.create(null);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export type PricingEntry = Record<string, unknown>;

// Applies one staged row's coerced values onto `item` in place (a Mongoose
// doc or a plain object being built for insert), and returns the
// pricingHistory entry this row contributes, or null if it has no pricing
// fields. `image` is skipped — it's a capture-only note until
// directory-select + SharePoint upload is built.
export function applyRowToItem(
  item: Record<string, unknown>,
  coerced: Record<string, unknown>
): PricingEntry | null {
  const pricing: PricingEntry = {};

  for (const [key, value] of Object.entries(coerced)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "itemNumber" || key === "image") continue;
    if (key === CUSTOM_KEY) {
      // Free-form columns the quote carried — merge onto item.customFields
      // by the vendor's exact label, later row winning per key. Blank
      // values are skipped so a re-import that omits a column doesn't wipe it.
      const incoming = value as Record<string, unknown>;
      const existing =
        item.customFields && typeof item.customFields === "object"
          ? (item.customFields as Record<string, unknown>)
          : {};
      const merged: Record<string, string> = { ...(existing as Record<string, string>) };
      for (const [label, v] of Object.entries(incoming)) {
        // Vendor-supplied column headers reach us here as free-form text,
        // so refuse keys that would corrupt an object's prototype chain
        // before the merge is handed back to Mongoose (which also strips
        // these, but a layered defence costs nothing).
        if (UNSAFE_KEYS.has(label)) continue;
        const text = v === null || v === undefined ? "" : String(v).trim();
        if (text !== "") merged[label] = text;
      }
      if (Object.keys(merged).length > 0) item.customFields = merged;
      continue;
    }
    if (key in PRICING_KEYS) {
      pricing[PRICING_KEYS[key]] = value;
      continue;
    }
    const field = QUOTE_FIELD_BY_KEY[key];
    if (!field?.path) continue;
    deepSet(item, field.path, value);
  }

  if (Object.keys(pricing).length === 0) return null;
  pricing.source = "quotation_import";
  if (!pricing.effectiveDate) pricing.effectiveDate = new Date();
  return pricing;
}
