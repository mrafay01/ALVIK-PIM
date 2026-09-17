import { LENGTH_UNITS, WEIGHT_UNITS, type LengthUnit, type WeightUnit, type MeasurementUnit } from "./types";

export function isLengthUnit(u: string): u is LengthUnit {
  return (LENGTH_UNITS as readonly string[]).includes(u);
}

export function isWeightUnit(u: string): u is WeightUnit {
  return (WEIGHT_UNITS as readonly string[]).includes(u);
}

export function isMeasurementUnit(u: string): u is MeasurementUnit {
  return isLengthUnit(u) || isWeightUnit(u);
}

// Conversion factors to a common base unit per dimension — mm for length,
// mg for weight. Never cross the two: converting a length unit to a weight
// unit (or vice versa) is a programming error, not a supported operation.
const LENGTH_TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
};

const WEIGHT_TO_MG: Record<WeightUnit, number> = {
  mg: 1,
  g: 1000,
  kg: 1_000_000,
  oz: 28_349.5231,
  ozt: 31_103.4768, // troy ounce — the unit jewelry/precious-metal weights are conventionally quoted in, distinct from the avoirdupois "oz"
};

// Converts without rounding — the caller decides precision at display
// time (see §12/§22). Throws rather than silently returning NaN or mixing
// dimensions, since a length<->weight conversion request is always a bug.
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return (value * LENGTH_TO_MM[from]) / LENGTH_TO_MM[to];
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return (value * WEIGHT_TO_MG[from]) / WEIGHT_TO_MG[to];
}

// Dimension-agnostic convert — picks the right table based on the units
// involved. Throws if the two units aren't from the same dimension.
export function convertMeasurementValue(
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit
): number {
  if (isLengthUnit(from) && isLengthUnit(to)) return convertLength(value, from, to);
  if (isWeightUnit(from) && isWeightUnit(to)) return convertWeight(value, from, to);
  throw new Error(`Cannot convert between incompatible units: ${from} -> ${to}`);
}

// Rounds only for display — never mutates/overwrites the stored value.
// Length gets 2 decimal places by default (matches the "45.72 cm" example
// in the spec); weight gets 3 (grams commonly quoted to a thousandth in
// jewelry costing).
export function roundForDisplay(value: number, unit: MeasurementUnit): number {
  const decimals = isWeightUnit(unit) ? 3 : 2;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
