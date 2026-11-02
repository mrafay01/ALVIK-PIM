import { ITEM_STATUSES } from "@/lib/enums";

// Which items can go into a marketplace bulk-import file. The review page
// only offers these, and the file generator re-applies the same rule to the
// ids it's sent, so a stale or hand-made request can't export anything else.
// Inactive items are never exportable.
export const EXPORTABLE_STATUSES = ITEM_STATUSES.filter((s) =>
  ["sku_permanent", "po_sent", "receiving", "live"].includes(s)
);

export const EXPORT_ELIGIBLE = {
  status: { $in: EXPORTABLE_STATUSES },
  itemNumber: { $nin: [null, ""] },
  active: { $ne: false },
};
