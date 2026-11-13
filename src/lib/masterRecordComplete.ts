import type { ItemDoc } from "@/models/Item";

// The publish gate from FRD Step 7 — an item can't count as a complete
// master record (and can't be submitted to the catalog) until every one of
// these is true. Mirrors the field list next to
// masterRecordComplete in the blueprint's items schema.
export type CompletionCheck = {
  field: string;
  ok: boolean;
  reason?: string;
};

export function checkMasterRecordComplete(
  item: Pick<
    ItemDoc,
    "itemNumber" | "category" | "specs" | "pricingHistory" | "imageCompleteness"
  >
): CompletionCheck[] {
  const latestPricing = item.pricingHistory?.[item.pricingHistory.length - 1];

  return [
    { field: "itemNumber", ok: !!item.itemNumber, reason: "Permanent SKU not yet assigned" },
    { field: "category", ok: !!item.category, reason: "Category not set" },
    { field: "specs.metal", ok: !!item.specs?.metal, reason: "Metal spec not set" },
    {
      field: "pricingHistory",
      ok: !!latestPricing?.msrp,
      reason: "No MSRP recorded",
    },
    {
      field: "imageCompleteness.main",
      ok: !!item.imageCompleteness?.main,
      reason: "No main image uploaded",
    },
    {
      field: "imageCompleteness.sides",
      ok: !!item.imageCompleteness?.sides,
      reason: "No side images uploaded",
    },
    {
      field: "imageCompleteness.models",
      ok: !!item.imageCompleteness?.models,
      reason: "No model images uploaded",
    },
  ];
}

export function isMasterRecordComplete(
  item: Pick<
    ItemDoc,
    "itemNumber" | "category" | "specs" | "pricingHistory" | "imageCompleteness"
  >
): boolean {
  return checkMasterRecordComplete(item).every((c) => c.ok);
}
