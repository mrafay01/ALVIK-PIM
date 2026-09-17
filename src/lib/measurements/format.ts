import type { Measurement, RingSizeValue, MeasurementUnit } from "./types";
import { roundForDisplay, convertMeasurementValue } from "./units";

// The one place unit-formatting text is produced — every screen that
// shows a measurement should go through this instead of re-implementing
// `${value} ${unit}` locally (§21).
export function formatMeasurement(m: Measurement | null | undefined, displayUnit?: MeasurementUnit): string {
  if (!m || typeof m.value !== "number" || Number.isNaN(m.value)) return "—";
  const unit = displayUnit ?? m.unit;
  const value = displayUnit && displayUnit !== m.unit ? convertMeasurementValue(m.value, m.unit, displayUnit) : m.value;
  return `${roundForDisplay(value, unit)} ${unit}`;
}

export function formatRingSize(size: RingSizeValue | null | undefined): string {
  if (!size || typeof size.value !== "number" || Number.isNaN(size.value)) return "—";
  return `${size.value} ${size.system}`;
}

// Formats three co-unit measurements as "5.2 × 5.1 × 3.2 mm" (§21) — all
// three must share a unit (typical for L×W×D on one component); returns
// "—" for any that's missing rather than guessing.
export function formatDimensions3(
  a: Measurement | null | undefined,
  b: Measurement | null | undefined,
  c: Measurement | null | undefined
): string {
  const parts = [a, b, c].map((m) => (m && typeof m.value === "number" ? roundForDisplay(m.value, m.unit) : null));
  if (parts.some((p) => p === null)) return "—";
  const unit = a?.unit ?? b?.unit ?? c?.unit ?? "mm";
  return `${parts.join(" × ")} ${unit}`;
}
