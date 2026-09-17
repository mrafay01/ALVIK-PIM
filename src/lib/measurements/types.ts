// Core types for the category-specific jewelry measurement system.
// See src/lib/measurements/schema.ts for the per-category field
// configuration that drives which of these get collected/shown.

// Length/dimension units kept deliberately separate from weight units —
// never mix a length value with a weight unit or vice versa.
export const LENGTH_UNITS = ["mm", "cm", "in"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const WEIGHT_UNITS = ["mg", "g", "kg", "oz", "ozt"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export type MeasurementUnit = LengthUnit | WeightUnit;

export const RING_SIZE_SYSTEMS = ["US", "UK", "EU", "JP"] as const;
export type RingSizeSystem = (typeof RING_SIZE_SYSTEMS)[number];

// Where a measurement's value came from — lets a calculated/estimated
// figure stay visibly distinguishable from what a supplier or a person
// actually provided (see §25/§27 of the spec this implements).
export const MEASUREMENT_SOURCES = ["supplier", "manual", "calculated"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

// A single structured measurement. `value` is the number as given in
// `unit` — never pre-converted or pre-rounded at storage time (see §12).
// `originalValue` preserves the raw supplier/import text ("18 inches")
// for debugging and reconciliation (see §19) even after parsing.
export interface Measurement {
  value: number;
  unit: MeasurementUnit;
  originalValue?: string;
  source?: MeasurementSource;
  isEstimated?: boolean;
}

// Ring sizing gets its own type rather than overloading Measurement —
// a size is meaningless without its sizing system, and the two numbers
// (value + system) are never unit-convertible the way mm/cm/in are.
export interface RingSizeValue {
  value: number;
  system: RingSizeSystem;
}

// Every measurable field a category config can reference. Grouped by
// concept in comments only — the flat union is what the schema/validator/
// UI actually key off of. `null` on any of these keys means "not
// provided/unknown"; the key being entirely absent behaves the same way.
// A provided `0` is an explicit zero, never conflated with "unknown"
// (see §13) — that distinction lives in the Measurement.value itself,
// never inferred from presence/absence.
//
// A handful of keys (height, width, thickness, length) are shared across
// multiple categories' configs (e.g. Pendant's "height" and Earring's
// "height" both use the universal "height" key) — that's fine because a
// single Item only ever carries one category's worth of measurements at
// a time, so there's no cross-category collision in storage.
export type MeasurementFieldKey =
  // Universal
  | "length"
  | "width"
  | "height"
  | "thickness"
  | "weight"
  // Bracelet
  | "circumference"
  | "inner_length"
  | "inner_width"
  | "inner_circumference"
  | "diameter"
  | "adjustable_min_length"
  | "adjustable_max_length"
  | "chain_width"
  | "charm_height"
  | "charm_width"
  | "charm_thickness"
  // Ring
  | "ring_size"
  | "inner_diameter"
  | "inner_circumference_ring"
  | "band_width"
  | "band_thickness"
  | "top_width"
  | "top_length"
  | "ring_height"
  | "setting_height"
  | "shank_width"
  | "shank_thickness"
  // Pendant
  | "bail_height"
  | "bail_width"
  | "bail_inner_height"
  | "bail_inner_width"
  | "chain_length"
  | "chain_thickness"
  // Earring
  | "drop_length"
  | "hoop_diameter"
  | "hoop_width"
  | "post_length"
  | "post_thickness"
  | "front_height"
  | "front_width"
  | "backing_height"
  | "backing_width"
  // Bangle
  | "outer_diameter"
  | "outer_circumference"
  | "opening_width"
  | "opening_height"
  | "gap_width"
  | "gap_height"
  | "profile_height"
  // Necklace
  | "pendant_height"
  | "pendant_width"
  | "pendant_thickness"
  | "clasp_width"
  | "clasp_length";

// The structured, per-item measurement bag. Every key is optional and
// independent — a category's config decides which of these it *offers*,
// but the stored document only ever contains what was actually entered
// (see §16: irrelevant fields are hidden, not stored as null-filled noise).
export type MeasurementValues = Partial<Record<MeasurementFieldKey, Measurement>>;

// Gemstone measurements are a deliberately separate structure from the
// jewelry item's own measurements (§20) — same Measurement shape, but
// never merged into MeasurementValues.
export interface StoneMeasurements {
  length?: Measurement;
  width?: Measurement;
  depth?: Measurement;
}

export interface AdjustableRange {
  adjustable: boolean;
  adjustable_min_length?: Measurement;
  adjustable_max_length?: Measurement;
}

// The full structured measurement document stored on Item.measurements.
// `raw` is the one catch-all for import text that couldn't be confidently
// parsed into a specific field (ambiguous "5 x 4", free-form supplier
// notes, etc.) — preserved rather than dropped, never guessed into a
// specific field (see §18).
export interface ItemMeasurements {
  category?: string;
  values?: MeasurementValues;
  ringSize?: RingSizeValue;
  adjustable?: boolean;
  stones?: StoneMeasurements;
  raw?: string;
  // Conditional-field toggles the UI reads to decide what to show —
  // stored so the choice survives a reload/re-edit (§17).
  hasCharm?: boolean;
  hasPendant?: boolean;
  isOpen?: boolean;
  earringType?: "hoop" | "stud" | "drop";
}
