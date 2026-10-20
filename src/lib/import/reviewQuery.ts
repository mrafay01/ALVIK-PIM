// Shared row filters for the Master File review page and the Flagged Items
// page, so a list on screen and a bulk action on "these rows" always mean
// exactly the same rows.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Search by SKU or title.
export function searchFilter(q: string): Record<string, unknown> {
  const t = q.trim().slice(0, 100);
  if (!t) return {};
  const rx = new RegExp(escapeRegex(t), "i");
  return { $or: [{ "coerced.itemNumber": rx }, { "coerced.title": rx }] };
}

export type RowScope = "unflagged" | "flagged" | "all" | "selected";

export function scopeFilter(scope: RowScope, rowIds?: string[]): Record<string, unknown> {
  if (scope === "unflagged") return { "flags.0": { $exists: false } };
  if (scope === "flagged") return { "flags.0": { $exists: true } };
  if (scope === "selected") return { _id: { $in: rowIds ?? [] } };
  return {};
}

// Rows still waiting on a batch's review page: not committed, not
// excluded, not sent to Flagged Items.
export function onReviewPage(batchId: string): Record<string, unknown> {
  return { batchId, committedItemId: null, parkedAt: null, reviewStatus: { $ne: "rejected" } };
}

// Rows on the Flagged Items page (all batches).
export const ON_FLAGGED_PAGE: Record<string, unknown> = {
  parkedAt: { $ne: null },
  committedItemId: null,
  reviewStatus: { $ne: "rejected" },
};
