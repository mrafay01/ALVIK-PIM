import type { ItemDoc } from "@/models/Item";
import type { MarketplaceListingDoc } from "@/models/MarketplaceListing";

// Merges an Item with its (possibly absent) MarketplaceListing overlay into
// one flat, platform-agnostic bag of values every export mapper reads from.
// Centralizing the fallback rules here means "what price do we export" has
// exactly one answer, shared by every platform's mapper, instead of each
// mapper re-deriving it slightly differently.

export type ResolvedListingFields = {
  itemNumber: string;
  category: string;
  metal: string;
  gender: string;
  upc: string;
  gtin: string;
  productTitle: string;
  productDescription: string;
  bulletFeatures: string[];
  price: number | null;
  salePrice: number | null;
  weightLb: number | null;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  marketplaceCategory: string;
  marketplaceSubtype: string;
  careInstructions: string;
  countryOfOrigin: string;
  chokingHazardWarning: string;
  prop65Warning: string;
};

type LeanItem = Pick<
  ItemDoc,
  "itemNumber" | "category" | "specs" | "pricingHistory"
> & { _id?: unknown };

type LeanListing = Partial<MarketplaceListingDoc> | null | undefined;

function latestPricing(item: LeanItem): { msrp?: number | null; ruePrice?: number | null } {
  const history = item.pricingHistory ?? [];
  if (history.length === 0) return {};
  // pricingHistory entries are appended in chronological order (see the
  // import commit route) — the last entry is the current price.
  return history[history.length - 1];
}

export function resolveListingFields(item: LeanItem, listing: LeanListing): ResolvedListingFields {
  const pricing = latestPricing(item);

  return {
    itemNumber: item.itemNumber ?? "",
    category: item.category ?? "",
    metal: item.specs?.metal ?? "",
    gender: item.specs?.gender ?? "",

    upc: listing?.upc ?? "",
    gtin: listing?.gtin ?? "",
    productTitle: listing?.productTitle ?? "",
    productDescription: listing?.productDescription ?? "",
    bulletFeatures: (listing?.bulletFeatures ?? [])
      .map((b) => b?.text ?? "")
      .filter((t) => t.length > 0),

    // Listing-level price wins when set; otherwise fall back to the item's
    // current internal pricing so a listing that hasn't been given a
    // platform-specific price yet still exports something usable.
    price: listing?.price ?? pricing.msrp ?? null,
    salePrice: listing?.salePrice ?? pricing.ruePrice ?? null,

    weightLb: listing?.weightLb ?? null,
    weightOz: listing?.weightOz ?? null,
    lengthIn: listing?.lengthIn ?? null,
    widthIn: listing?.widthIn ?? null,
    heightIn: listing?.heightIn ?? null,

    marketplaceCategory: listing?.marketplaceCategory ?? "",
    marketplaceSubtype: listing?.marketplaceSubtype ?? "",
    careInstructions: listing?.careInstructions ?? "",
    countryOfOrigin: listing?.countryOfOrigin ?? "",
    chokingHazardWarning: listing?.chokingHazardWarning ?? "",
    prop65Warning: listing?.prop65Warning ?? "",
  };
}
