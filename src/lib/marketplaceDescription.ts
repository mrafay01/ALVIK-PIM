import type { DescriptionPlatform } from "@/lib/enums";
import { DESCRIPTION_PLATFORMS } from "@/lib/enums";

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

// Has this platform got its own description (rather than using the item's
// general one)?
export function isMarketplaceDescriptionOverridden(
  item: { marketplaceDescriptions?: DescriptionsBag },
  platform: DescriptionPlatform
): boolean {
  return !!getEntry(item.marketplaceDescriptions, platform)?.text?.trim();
}

export { DESCRIPTION_PLATFORMS };
