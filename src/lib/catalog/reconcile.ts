import {
  AUTHORITATIVE_FIELD_BY_PATH,
  getByPath,
  valuesConflict,
  type AuthoritativeField,
} from "./authoritativeFields";
import { applyRowToItem } from "@/lib/quote-import/applyToItem";
import { QUOTE_FIELD_BY_KEY } from "@/lib/quote-import/fields";

// Reconcile a single PI row against an existing in-catalog item.
//
// Returns:
//   - `plain`: the item object AFTER applying every non-authoritative
//     field (plating, stone info, title, etc.) + pricing history. Safe
//     to write back to Mongo immediately.
//   - `conflicts`: one entry per authoritative field that the PI tried
//     to change on this item. Each becomes a CatalogConflict doc.
//     The item's stored value is left untouched for these — the resolve
//     endpoint is what applies them.
//   - `pricingEntry`: the row's pricingHistory addition, or null.
//
// For a NOT-in-catalog item, callers should keep using applyRowToItem
// directly — the pipeline merges straight through, same as today.

export type ConflictEntry = {
  field: AuthoritativeField;
  catalogValue: unknown;
  incomingValue: unknown;
};

export type ReconcileResult = {
  plain: Record<string, unknown>;
  conflicts: ConflictEntry[];
  pricingEntry: Record<string, unknown> | null;
};

// Build a quick lookup: QUOTE_FIELDS key -> item dot-path, so we can
// walk the row's coerced map and translate each quote-key into its
// authoritative-field match (if any) without reaching back into
// QUOTE_FIELDS for every row.
function quoteKeyToPath(key: string): string | null {
  const field = QUOTE_FIELD_BY_KEY[key];
  return field?.path ?? null;
}

export function reconcileRowAgainstCatalogItem(
  catalogItemPlain: Record<string, unknown>,
  coerced: Record<string, unknown>
): ReconcileResult {
  // 1. Pull aside every authoritative-field value from the row BEFORE
  //    applyRowToItem touches them. For each one that differs, record
  //    a conflict and strip the key out of the row so applyRowToItem
  //    doesn't write it. For each one that matches, leave the key in —
  //    applyRowToItem's dot-set is a no-op when the value is identical,
  //    and keeping it is harmless and avoids edge cases.
  const conflicts: ConflictEntry[] = [];
  const strippedCoerced: Record<string, unknown> = { ...coerced };

  for (const [key, incoming] of Object.entries(coerced)) {
    const path = quoteKeyToPath(key);
    if (!path) continue;
    const authField = AUTHORITATIVE_FIELD_BY_PATH[path];
    if (!authField) continue;

    const catalogValue = getByPath(catalogItemPlain, path);
    if (valuesConflict(authField.kind, catalogValue, incoming)) {
      conflicts.push({ field: authField, catalogValue, incomingValue: incoming });
      // Strip so applyRowToItem won't write it through.
      delete strippedCoerced[key];
    }
  }

  // 2. applyRowToItem handles everything else — non-authoritative
  //    scalars dot-set in place, custom fields merged into customFields,
  //    pricing fields extracted into the returned pricingEntry.
  const pricingEntry = applyRowToItem(catalogItemPlain, strippedCoerced);

  return { plain: catalogItemPlain, conflicts, pricingEntry };
}
