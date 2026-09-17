import { Types } from "mongoose";
import Item from "@/models/Item";

// Resolves the sibling variations of an item — every other Item sharing
// its `variationGroupId` when present, falling back to `baseSku` for items
// created before that field existed (see the field comment on Item.ts).
// Excludes the item itself. Used by the item detail page's "Variations"
// section and anywhere else that needs "what are this item's siblings."
export async function findSiblingVariations(item: {
  _id: unknown;
  variationGroupId?: unknown;
  baseSku?: string | null;
}) {
  const match = item.variationGroupId
    ? { variationGroupId: item.variationGroupId }
    : item.baseSku
      ? { baseSku: item.baseSku }
      : null;
  if (!match) return [];

  return Item.find({ ...match, _id: { $ne: item._id } })
    .select("itemNumber baseSku variantSuffix title status specs.plating pricingHistory active")
    .sort({ variantSuffix: 1 })
    .lean();
}

export function newVariationGroupId(): Types.ObjectId {
  return new Types.ObjectId();
}
