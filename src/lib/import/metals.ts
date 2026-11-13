// Metal values the Master File import accepts (no server imports, so the
// Flagged Items screen can show the same list as its hint). Keys are
// lowercased with spaces collapsed; values are what gets stored. A value
// not listed here is flagged for a person to classify.
export const METAL_MAP: Record<string, string> = {
  brass: "Brass",
  "14k gp": "14K GP",
  "14kgp": "14K GP",
  silver: "Silver",
  "925 silver": "Silver",
  "sterling silver": "Silver",
  // The real Master File writes sterling silver this way on most rows; it's
  // kept exactly as written (not turned into "Silver") so the catalog export
  // gives back the Master File's own value.
  ".925 sterling silver": ".925 Sterling Silver",
  "sterling silver 925": ".925 Sterling Silver",
  gold: "Gold",
  "18k gold": "18K Gold",
};

export function metalKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// The stored values, for hints ("Brass, 14K GP, Silver, …").
export const KNOWN_METALS = [...new Set(Object.values(METAL_MAP))];
