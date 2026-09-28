import type { ItemMeasurements, Measurement, MeasurementFieldKey, RingSizeValue } from "./types";
import { RING_SIZE_SYSTEMS, LENGTH_UNITS, WEIGHT_UNITS } from "./types";
import { getMeasurementSchema, type MeasurementFieldConfig } from "./schema";

export interface ValidationIssue {
  field: string;
  label: string;
  message: string;
  /** Only set when validating one row of an import batch (§24 format). */
  row?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const ALL_UNITS = new Set<string>([...LENGTH_UNITS, ...WEIGHT_UNITS]);

// A single field's numeric+unit sanity check — used both for one manually
// entered field and for each parsed import cell. Deliberately does not
// silently coerce or clamp anything (§15: "do not silently correct
// invalid values") — every problem becomes an issue instead.
function validateMeasurementValue(
  m: Measurement | null | undefined,
  label: string,
  fieldKey: string,
  row?: number
): ValidationIssue[] {
  // Absent or explicitly null = "unknown", never an error on its own —
  // required-ness is checked separately by the caller (§13, §16).
  if (m === null || m === undefined) return [];

  const issues: ValidationIssue[] = [];
  const { value, unit } = m;

  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push({ field: fieldKey, label, row, message: `Expected a numeric ${label.toLowerCase()}.` });
    return issues;
  }
  if (!Number.isFinite(value)) {
    issues.push({ field: fieldKey, label, row, message: `${label} cannot be infinite.` });
    return issues;
  }
  if (value < 0) {
    issues.push({ field: fieldKey, label, row, message: `${label} cannot be negative.` });
  }
  // Excessive precision — more than 4 decimal places on a physical
  // measurement is almost certainly a parsing artifact, not a real
  // supplier figure (§15 "excessive precision").
  const decimals = (String(value).split(".")[1] ?? "").length;
  if (decimals > 4) {
    issues.push({
      field: fieldKey,
      label,
      row,
      message: `${label} has unrealistic precision (${value}); check the source value.`,
    });
  }
  if (!unit || !ALL_UNITS.has(unit)) {
    issues.push({ field: fieldKey, label, row, message: `${label} has an unrecognized unit "${unit}".` });
  }

  return issues;
}

function validateRingSize(
  size: RingSizeValue | null | undefined,
  row?: number
): ValidationIssue[] {
  if (size === null || size === undefined) return [];
  const issues: ValidationIssue[] = [];
  if (typeof size.value !== "number" || Number.isNaN(size.value) || !Number.isFinite(size.value)) {
    issues.push({ field: "ring_size", label: "Ring Size", row, message: `Expected a numeric ring size.` });
  } else if (size.value <= 0) {
    issues.push({ field: "ring_size", label: "Ring Size", row, message: `Ring size must be greater than zero.` });
  }
  if (!size.system || !(RING_SIZE_SYSTEMS as readonly string[]).includes(size.system)) {
    issues.push({
      field: "ring_size_system",
      label: "Ring Size System",
      row,
      message: `Ring size system must be one of ${RING_SIZE_SYSTEMS.join(", ")}.`,
    });
  }
  return issues;
}

// Validates one item's full structured measurements against its
// category's config: required fields present, every provided value sane,
// and the adjustable min<=max rule (§14). Pass `row` when validating one
// row of an import batch so issues can cite it (§24).
export function validateItemMeasurements(
  measurements: ItemMeasurements | null | undefined,
  category: string | null | undefined,
  row?: number
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const schema = getMeasurementSchema(category);
  const values = measurements?.values ?? {};

  if (schema) {
    for (const field of schema.fields) {
      const key = field.key as MeasurementFieldKey;
      if (field.kind === "ring_size") {
        issues.push(...validateRingSize(measurements?.ringSize, row));
        if (field.required && !measurements?.ringSize) {
          issues.push({
            field: "ring_size",
            label: field.label,
            row,
            message: `${field.label} is required for ${schema.category}.`,
          });
        }
        continue;
      }
      const m = values[key];
      issues.push(...validateMeasurementValue(m, field.label, key, row));
      if (field.required && (m === null || m === undefined)) {
        issues.push({
          field: key,
          label: field.label,
          row,
          message: `${field.label} is required for ${schema.category}.`,
        });
      }
    }
  }

  // Adjustable min/max — validated whenever both are present, regardless
  // of whether the category's config marks adjustability as supported,
  // so a stray pair on the wrong category is still caught rather than
  // silently ignored.
  const min = values.adjustable_min_length;
  const max = values.adjustable_max_length;
  issues.push(...validateMeasurementValue(min, "Adjustable Min Length", "adjustable_min_length", row));
  issues.push(...validateMeasurementValue(max, "Adjustable Max Length", "adjustable_max_length", row));
  if (min && max && typeof min.value === "number" && typeof max.value === "number" && min.value > max.value) {
    issues.push({
      field: "adjustable_max_length",
      label: "Adjustable Max Length",
      row,
      message: "Minimum length cannot exceed maximum length.",
    });
  }

  // Stone measurements, if present, get the same numeric sanity pass —
  // kept in their own namespace so a stone-measurement error is never
  // reported as if it were a jewelry-item measurement (§20).
  const stones = measurements?.stones;
  if (stones) {
    issues.push(...validateMeasurementValue(stones.length, "Stone Length", "stones.length", row));
    issues.push(...validateMeasurementValue(stones.width, "Stone Width", "stones.width", row));
    issues.push(...validateMeasurementValue(stones.depth, "Stone Depth", "stones.depth", row));
  }

  return { valid: issues.length === 0, issues };
}

// One human-readable multi-line report across many rows/items, matching
// the "Row 124: ... / Row 219: ..." format from §24.
export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const prefix = issue.row != null ? `Row ${issue.row}: ` : "";
      return `${prefix}${issue.label}: ${issue.message}`;
    })
    .join("\n");
}

// Shared by both the "New catalog item" and "Edit item" forms — strips an
// incomplete ring size (a value was typed but then cleared, leaving NaN)
// and omits the whole object when nothing was entered, so an item with no
// measurements filled in sends `measurements: undefined` on save rather
// than an empty-but-present object.
export function cleanMeasurementsForSave(m: ItemMeasurements): ItemMeasurements | undefined {
  const cleaned: ItemMeasurements = { ...m };
  if (cleaned.ringSize && Number.isNaN(cleaned.ringSize.value)) delete cleaned.ringSize;
  if (cleaned.values && Object.keys(cleaned.values).length === 0) delete cleaned.values;
  if (!cleaned.raw?.trim()) delete cleaned.raw;

  const hasContent =
    !!cleaned.ringSize ||
    !!cleaned.values ||
    !!cleaned.raw ||
    !!cleaned.hasCharm ||
    !!cleaned.hasPendant ||
    !!cleaned.isOpen ||
    !!cleaned.earringType ||
    !!cleaned.adjustable;

  return hasContent ? cleaned : undefined;
}

export type { MeasurementFieldConfig };
