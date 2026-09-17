import type { DescriptionPlatform } from "@/lib/enums";
import { DESCRIPTION_PLATFORMS } from "@/lib/enums";
import type { ItemDoc } from "@/models/Item";

// Falls back to the item's general description wherever a platform's own
// box is empty, so every platform always has *something* to show/export
// even before anyone (or the future AI pass) has written a tailored one.
// `marketplaceDescriptions` is a Mongoose Map; a .lean() read hands back a
// plain object instead (Mongoose's documented behavior), so accept either.
type DescriptionsBag =
  | Map<string, { text?: string | null } | null | undefined>
  | Record<string, { text?: string | null } | null | undefined>
  | null
  | undefined;

function getEntry(bag: DescriptionsBag, platform: DescriptionPlatform) {
  if (!bag) return undefined;
  return bag instanceof Map ? bag.get(platform) : bag[platform];
}

export function resolveMarketplaceDescription(
  item: Pick<ItemDoc, "description"> & { marketplaceDescriptions?: DescriptionsBag },
  platform: DescriptionPlatform
): string {
  const override = getEntry(item.marketplaceDescriptions, platform)?.text?.trim();
  return override || item.description || "";
}

export function isMarketplaceDescriptionOverridden(
  item: { marketplaceDescriptions?: DescriptionsBag },
  platform: DescriptionPlatform
): boolean {
  return !!getEntry(item.marketplaceDescriptions, platform)?.text?.trim();
}

export { DESCRIPTION_PLATFORMS };
