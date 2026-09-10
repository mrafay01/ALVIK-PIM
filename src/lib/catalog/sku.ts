// A catalog SKU is a base plus an optional hyphen-suffix that marks a
// variation of the same product: A1234, A1234-GP, A1234-RP. Rings carry a
// further size segment: R1234-GP-6, R1234-6. The base is always the text
// before the FIRST hyphen; everything after it (including any further
// hyphens) is the variant suffix.

export function splitSku(sku: string): { baseSku: string; variantSuffix: string | null } {
  const trimmed = (sku ?? "").trim();
  const dash = trimmed.indexOf("-");
  if (dash === -1) return { baseSku: trimmed, variantSuffix: null };
  const suffix = trimmed.slice(dash + 1).trim();
  return {
    baseSku: trimmed.slice(0, dash).trim(),
    variantSuffix: suffix === "" ? null : suffix,
  };
}
