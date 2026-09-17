// UI-only picklists for Category / Gender / Brand / Metal / Plating —
// unlike the enums in lib/enums.ts, none of these are enforced by the Item
// schema (all four remain free-text `String` fields there) since existing
// catalog data — legacy Master File imports especially — may carry values
// outside this list. These constants only drive the dropdown options on
// the "New catalog item" and "Edit item" forms.
export const CATEGORY_OPTIONS = [
  "Bracelet",
  "Ring",
  "Pendant",
  "Earring",
  "Bangle",
  "Necklace",
  "Anklet",
] as const;

export const GENDER_OPTIONS = ["Men", "Women", "Kids", "Teens", "Adults"] as const;

export const BRAND_OPTIONS = ["GiGiGirl", "Genevive", "Rachel Glauber"] as const;

export const METAL_OPTIONS = [".925 Sterling Silver", "Brass"] as const;

export const PLATING_OPTIONS = [
  "White Gold Plating",
  "14K Gold Plating",
  "18K Rose Gold Plating",
  "Two-Tone Plating",
  "Rhodium Plating",
] as const;
