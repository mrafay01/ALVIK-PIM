// The columns that make up one line item on a vendor quote, in the order
// they appear on the physical quote sheet (see the header image in the
// feature request). This one list drives three things:
//   - the header-alias table the file parser matches against
//   - the fields rendered on the manual "new quote" page
//   - the per-row editor on the quote review page
//
// `path` is where the value lands on the Item document (dot-path, fed
// through setDotPath at commit time). `specs` is strict:false so the
// stone/measurement keys that have no first-class Item field are still
// stored — they just live directly under `specs`.
//
// `kind` picks the coercion rule in parseQuoteFile.ts and the input type
// on the manual form.

export type QuoteFieldKind = "text" | "number" | "money" | "weight" | "date" | "image";

export interface QuoteField {
  /** stable key used in `coerced` and as the manual-form field name */
  key: string;
  /** column label as printed on the quote sheet */
  label: string;
  /** dot-path on the Item document, or null for capture-only fields (Image) */
  path: string | null;
  kind: QuoteFieldKind;
  /** header spellings seen in the wild, lowercased; `label` is always matched too */
  aliases?: string[];
}

export const QUOTE_FIELDS: QuoteField[] = [
  { key: "itemNumber", label: "CZ Collections Item no#", path: "itemNumber", kind: "text",
    aliases: ["cz item#", "cz item no", "cz collections item no#", "cz collection item no", "item no", "item#", "cz#"] },
  { key: "image", label: "Image", path: null, kind: "image",
    aliases: ["image", "picture", "photo", "img"] },
  { key: "sourcePoNumber", label: "PO number", path: "specs.sourcePoNumber", kind: "text",
    aliases: ["po number", "po#", "po no", "po"] },
  { key: "boxNumber", label: "Company box#", path: "boxNumber", kind: "text",
    aliases: ["company box#", "company box no", "box#", "box no", "box number"] },
  { key: "vendorSku", label: "Vendor item#", path: "vendorSku", kind: "text",
    aliases: ["vendor item#", "vendor item no", "vendor sku", "vendor style#", "vendor style no"] },
  { key: "silverPricePerGram", label: "Silver price based on- Per gram", path: "specs.silverPricePerGram", kind: "money",
    aliases: ["silver price based on- per gram", "silver price per gram", "silver price/gram", "silver price per g"] },
  { key: "totalWeight", label: "Total Weight", path: "specs.weight.totalG", kind: "weight",
    aliases: ["total weight", "total wt", "gross weight", "total weight (g)"] },
  { key: "silverWeight", label: "Silver Weight", path: "specs.weight.silverG", kind: "weight",
    aliases: ["silver weight", "silver wt", "silver weight (g)"] },
  { key: "mainStoneInfo", label: "Main Stone Info", path: "specs.mainStoneInfo", kind: "text",
    aliases: ["main stone info", "main stone", "main stone information"] },
  { key: "mainStoneColor", label: "Main Stone color", path: "specs.mainStoneColor", kind: "text",
    aliases: ["main stone color", "main stone colour"] },
  { key: "mainStoneType", label: "Main Stone type", path: "specs.mainStoneType", kind: "text",
    aliases: ["main stone type"] },
  { key: "restStoneInfo", label: "Rest Stone info combined", path: "specs.restStoneInfo", kind: "text",
    aliases: ["rest stone info combined", "rest stone info", "rest stone", "rest stones combined"] },
  { key: "restStoneColors", label: "Rest Stone colors", path: "specs.restStoneColors", kind: "text",
    aliases: ["rest stone colors", "rest stone colours"] },
  { key: "restStoneType", label: "Rest Stone type", path: "specs.restStoneType", kind: "text",
    aliases: ["rest stone type"] },
  { key: "plating", label: "Plating", path: "specs.plating", kind: "text",
    aliases: ["plating"] },
  { key: "lengthBrNec", label: "Length for BR & NEC (in inches)", path: "specs.lengthBrNec", kind: "text",
    aliases: ["length for br & nec (in inches)", "length for br & nec", "length for br and nec", "length br nec"] },
  { key: "extenderBrNec", label: "Extender size for BR & NEC", path: "specs.extenderBrNec", kind: "text",
    aliases: ["extender size for br & nec", "extender size for br and nec", "extender br nec", "extender size"] },
  { key: "itemSize", label: "Size of item length and width", path: "specs.itemSize", kind: "text",
    aliases: ["size of item length and width", "size of item length & width", "size (length and width)", "size (length & width)", "item size", "size l x w"] },
  { key: "ringSize", label: "Ring size", path: "specs.ringSize", kind: "text",
    aliases: ["ring size", "ring sz"] },
  { key: "clasp", label: "Clasp type", path: "specs.clasp", kind: "text",
    aliases: ["clasp type", "clasp"] },
  { key: "postLength", label: "Length of the post", path: "specs.postLength", kind: "text",
    aliases: ["length of the post", "post length", "length of post"] },
  { key: "pushBackSize", label: "Push back size", path: "specs.pushBackSize", kind: "text",
    aliases: ["push back size", "pushback size", "push-back size"] },
  { key: "chainThickness", label: "Thickness of chain", path: "specs.thickness", kind: "text",
    aliases: ["thickness of chain", "chain thickness", "thickness"] },
  { key: "platingType", label: "Plating Type", path: "specs.platingType", kind: "text",
    aliases: ["plating type"] },
  { key: "laborCostPerGram", label: "LABOR COST PER GRAM", path: "specs.laborCostPerGram", kind: "money",
    aliases: ["labor cost per gram", "labour cost per gram", "labor cost/gram", "labor cost per g"] },
  { key: "qty", label: "Qty", path: "specs.quotedQty", kind: "number",
    aliases: ["qty", "quantity", "qty."] },
  { key: "laborCostTotal", label: "labor cost total", path: "specs.laborCostTotal", kind: "money",
    aliases: ["labor cost total", "labour cost total", "total labor cost"] },
  { key: "silverCostTotal", label: "silver cost total", path: "specs.silverCostTotal", kind: "money",
    aliases: ["silver cost total", "total silver cost"] },
  { key: "price", label: "Price", path: "pricing.msrp", kind: "money",
    aliases: ["price", "unit price", "msrp"] },
  { key: "totalPrice", label: "total price", path: "pricing.totalPrice", kind: "money",
    aliases: ["total price", "line total"] },
  { key: "totalPo", label: "Total PO", path: "specs.totalPoValue", kind: "money",
    aliases: ["total po", "total po value", "po total"] },
  { key: "material", label: "Material", path: "specs.metal", kind: "text",
    aliases: ["material", "metal"] },
  { key: "stamp", label: "Stamp", path: "specs.stamp", kind: "text",
    aliases: ["stamp", "hallmark"] },
  { key: "confirmationDate", label: "Confirmation date", path: "pricing.effectiveDate", kind: "date",
    aliases: ["confirmation date", "confirmed date", "conf date", "confirmation dt"] },
];

// key -> field, for the review editor and commit route.
export const QUOTE_FIELD_BY_KEY: Record<string, QuoteField> = Object.fromEntries(
  QUOTE_FIELDS.map((f) => [f.key, f])
);

// lowercased header (label + every alias) -> field key, for the file parser.
export const QUOTE_HEADER_TO_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const f of QUOTE_FIELDS) {
    map[f.label.trim().toLowerCase()] = f.key;
    for (const a of f.aliases ?? []) map[a.trim().toLowerCase()] = f.key;
  }
  return map;
})();

// The note dropped into the Image field until directory-select + SharePoint
// upload is built (see the feature request — deferred on purpose).
export const IMAGE_PLACEHOLDER_NOTE = "working on it";
