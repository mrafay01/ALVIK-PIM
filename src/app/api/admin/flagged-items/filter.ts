import { ON_FLAGGED_PAGE, searchFilter } from "@/lib/import/reviewQuery";

export type FlaggedScope = "fixed" | "filtered" | "selected";

// Which Flagged Items rows an action applies to.
//   fixed    -> rows with no issues left (matching the search)
//   filtered -> rows shown with the current issue filter + search
//   selected -> the ticked rows
export function flaggedFilter(opts: {
  scope: FlaggedScope;
  issue?: string;
  q?: string;
  rowIds?: string[];
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...ON_FLAGGED_PAGE, ...searchFilter(opts.q ?? "") };
  if (opts.scope === "fixed") filter["flags.0"] = { $exists: false };
  if (opts.scope === "filtered" && opts.issue) filter["flags.field"] = opts.issue;
  if (opts.scope === "selected") filter._id = { $in: opts.rowIds ?? [] };
  return filter;
}
