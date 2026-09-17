import type { Measurement, LengthUnit, WeightUnit } from "./types";
import { isLengthUnit, isWeightUnit } from "./units";

// Recognized unit spellings from real supplier sheets, mapped to their
// canonical LengthUnit/WeightUnit. Deliberately small and explicit —
// anything not in this table is left unparsed rather than guessed.
const LENGTH_UNIT_ALIASES: Record<string, LengthUnit> = {
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
};

const WEIGHT_UNIT_ALIASES: Record<string, WeightUnit> = {
  mg: "mg",
  milligram: "mg",
  milligrams: "mg",
  g: "g",
  gram: "g",
  grams: "g",
  gm: "g",
  gms: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  ozt: "ozt",
  "troy oz": "ozt",
  "troy ounce": "ozt",
};

// Matches a single "<number> <unit>" value, e.g. "18 in", "18\"", "45cm",
// "450mm", with or without a space and any of the recognized unit
// spellings (§18 examples). Does not match multi-value strings like
// "5 x 4 mm" — that's handled by parseDimensionPair below, and only when
// the caller has explicitly opted into that interpretation.
const SINGLE_VALUE_RE = /^\s*(-?\d+(?:\.\d+)?)\s*("|[a-zA-Z. ]+)?\s*$/;

export interface ParsedMeasurement {
  measurement: Measurement | null;
  /** Set when the raw text couldn't be confidently parsed — never guessed. */
  unrecognized: boolean;
}

function normalizeUnitToken(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
}

// Parses one "<number><unit>" cell into a structured Measurement. Returns
// unrecognized:true (never a guess) when the unit can't be confidently
// resolved — the caller decides whether that becomes an import error.
export function parseSingleMeasurement(
  raw: string | null | undefined,
  opts: { dimension: "length" | "weight"; defaultUnit?: LengthUnit | WeightUnit; source?: Measurement["source"] } = {
    dimension: "length",
  }
): ParsedMeasurement {
  if (raw == null) return { measurement: null, unrecognized: false };
  const text = String(raw).trim();
  if (text === "") return { measurement: null, unrecognized: false };

  const match = SINGLE_VALUE_RE.exec(text);
  if (!match) return { measurement: null, unrecognized: true };

  const value = Number(match[1]);
  if (Number.isNaN(value)) return { measurement: null, unrecognized: true };

  const unitToken = normalizeUnitToken(match[2]);
  let unit: LengthUnit | WeightUnit | undefined;

  if (unitToken) {
    unit =
      opts.dimension === "length"
        ? LENGTH_UNIT_ALIASES[unitToken]
        : WEIGHT_UNIT_ALIASES[unitToken];
    if (!unit) return { measurement: null, unrecognized: true };
  } else if (opts.defaultUnit) {
    unit = opts.defaultUnit;
  } else {
    // No unit given and no default to fall back on — this is exactly the
    // "5 x 4" ambiguous case from §18: a bare number alone is never
    // guessed into a unit.
    return { measurement: null, unrecognized: true };
  }

  return {
    measurement: {
      value,
      unit,
      originalValue: text,
      source: opts.source ?? "supplier",
    },
    unrecognized: false,
  };
}

// Parses "5 x 4 mm" / "5×4mm" into two length Measurements — ONLY when
// the caller (i.e. the column mapping) has already established that this
// column means length×width for this row. Never called speculatively.
export function parseDimensionPair(
  raw: string | null | undefined,
  source: Measurement["source"] = "supplier"
): { first: Measurement | null; second: Measurement | null; unrecognized: boolean } {
  if (raw == null) return { first: null, second: null, unrecognized: false };
  const text = String(raw).trim();
  if (text === "") return { first: null, second: null, unrecognized: false };

  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[x×]\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z."]+)?\s*$/.exec(text);
  if (!match) return { first: null, second: null, unrecognized: true };

  const a = Number(match[1]);
  const b = Number(match[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return { first: null, second: null, unrecognized: true };

  const unitToken = normalizeUnitToken(match[3]);
  const unit = unitToken ? LENGTH_UNIT_ALIASES[unitToken] : "mm";
  if (!unit) return { first: null, second: null, unrecognized: true };

  return {
    first: { value: a, unit, originalValue: text, source },
    second: { value: b, unit, originalValue: text, source },
    unrecognized: false,
  };
}

export { isLengthUnit, isWeightUnit };
