import type { ResolvedListingFields } from "./resolveListing";

// Column headers copied verbatim from "Target import template.csv" — one
// header row, no machine-key row. Target-Plus custom fields keep their full
// "Custom Fields > Target-Plus > ..." path as the header text.
export const TARGET_COLUMNS: string[] = [
  "Item Number",
  "Name",
  "Description",
  "Brand",
  "Category",
  "Identifier > UPC",
  "Price",
  "Pounds",
  "Ounces",
  "Length",
  "Width",
  "Height",
  "Custom Fields > Target-Plus > apparel and accessories subtype",
  "Custom Fields > Target-Plus > Bullet Features",
  "Custom Fields > Target-Plus > Bullet Features",
  "Custom Fields > Target-Plus > Bullet Features",
  "Custom Fields > Target-Plus > Bullet Features",
  "Custom Fields > Target-Plus > Care and Cleaning",
  "Custom Fields > Target-Plus > Category",
  "Custom Fields > Target-Plus > Chain Style",
  "Custom Fields > Target-Plus > Closure Type",
  "Custom Fields > Target-Plus > Color",
  "Custom Fields > Target-Plus > Color Family",
  "Custom Fields > Target-Plus > CPSC Choking Hazard Warnings",
  "Custom Fields > Target-Plus > Extended Length",
  "Custom Fields > Target-Plus > Gender",
  "Custom Fields > Target-Plus > Import Description",
  "Custom Fields > Target-Plus > Includes",
  "Custom Fields > Target-Plus > Material General",
  "Custom Fields > Target-Plus > number of pieces",
  "Custom Fields > Target-Plus > number of stones",
  "Custom Fields > Target-Plus > Product Length",
  "Custom Fields > Target-Plus > Prop 65 Warning",
  "Custom Fields > Target-Plus > Sale Price",
  "Custom Fields > Target-Plus > season or event depicted",
  "Custom Fields > Target-Plus > stone color",
  "Custom Fields > Target-Plus > stone type",
  "Custom Fields > Target-Plus > Targeted Audience",
  "Custom Fields > Target-Plus > Tax",
];

// The template has FOUR separate "Bullet Features" columns (same header
// text, repeated) — array position is the only thing that distinguishes
// them, so the row array below must line up 1:1 with TARGET_COLUMNS by
// index, not by header name.
export function mapItemToTargetRow(fields: ResolvedListingFields): (string | number)[] {
  const bullets = fields.bulletFeatures;
  return [
    fields.itemNumber, // Item Number
    fields.productTitle, // Name
    fields.productDescription, // Description
    "", // Brand
    fields.category, // Category
    fields.upc, // Identifier > UPC
    fields.price != null ? fields.price : "", // Price
    fields.weightLb != null ? fields.weightLb : "", // Pounds
    fields.weightOz != null ? fields.weightOz : "", // Ounces
    fields.lengthIn != null ? fields.lengthIn : "", // Length
    fields.widthIn != null ? fields.widthIn : "", // Width
    fields.heightIn != null ? fields.heightIn : "", // Height
    fields.marketplaceSubtype, // apparel and accessories subtype
    bullets[0] ?? "", // Bullet Features (1st)
    bullets[1] ?? "", // Bullet Features (2nd)
    bullets[2] ?? "", // Bullet Features (3rd)
    bullets[3] ?? "", // Bullet Features (4th)
    fields.careInstructions, // Care and Cleaning
    fields.marketplaceCategory, // Category (Target-Plus taxonomy)
    "", // Chain Style
    "", // Closure Type
    "", // Color
    "", // Color Family
    fields.chokingHazardWarning, // CPSC Choking Hazard Warnings
    "", // Extended Length
    fields.gender, // Gender
    "", // Import Description
    "", // Includes
    fields.metal, // Material General
    "", // number of pieces
    "", // number of stones
    fields.lengthIn != null ? fields.lengthIn : "", // Product Length
    fields.prop65Warning, // Prop 65 Warning
    fields.salePrice != null ? fields.salePrice : "", // Sale Price
    "", // season or event depicted
    "", // stone color
    "", // stone type
    "", // Targeted Audience
    "", // Tax
  ];
}
