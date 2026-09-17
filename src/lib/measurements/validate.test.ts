import { validateItemMeasurements, formatValidationIssues } from "./validate";
import type { ItemMeasurements } from "./types";

describe("validateItemMeasurements", () => {
  it("accepts a valid Ring with ring_size + system", () => {
    const m: ItemMeasurements = {
      ringSize: { value: 7, system: "US" },
      values: { band_width: { value: 2, unit: "mm" } },
    };
    const result = validateItemMeasurements(m, "Ring");
    expect(result.valid).toBe(true);
  });

  it("rejects a Ring missing ring_size", () => {
    const m: ItemMeasurements = { values: {} };
    const result = validateItemMeasurements(m, "Ring");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "ring_size")).toBe(true);
  });

  it("rejects a non-numeric ring size", () => {
    const m = { ringSize: { value: Number.NaN, system: "US" } } as unknown as ItemMeasurements;
    const result = validateItemMeasurements(m, "Ring");
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/numeric ring size/i);
  });

  it("rejects an invalid ring size system", () => {
    const m = { ringSize: { value: 7, system: "XX" } } as unknown as ItemMeasurements;
    const result = validateItemMeasurements(m, "Ring");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "ring_size_system")).toBe(true);
  });

  it("rejects negative length measurements", () => {
    const m: ItemMeasurements = { values: { length: { value: -10, unit: "mm" } } };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /cannot be negative/i.test(i.message))).toBe(true);
  });

  it("rejects NaN values", () => {
    const m: ItemMeasurements = { values: { length: { value: Number.NaN, unit: "mm" } } };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
  });

  it("rejects Infinity values", () => {
    const m: ItemMeasurements = { values: { length: { value: Number.POSITIVE_INFINITY, unit: "mm" } } };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /infinite/i.test(i.message))).toBe(true);
  });

  it("rejects an unrecognized unit", () => {
    const m = { values: { length: { value: 5, unit: "furlongs" } } } as unknown as ItemMeasurements;
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /unrecognized unit/i.test(i.message))).toBe(true);
  });

  it("accepts an explicit zero (distinct from missing)", () => {
    const m: ItemMeasurements = { values: { thickness: { value: 0, unit: "mm" } } };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(true);
  });

  it("treats a missing/null field as unknown, not an error, when not required", () => {
    const m: ItemMeasurements = { values: {} };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(true);
  });

  it("rejects adjustable_min_length > adjustable_max_length", () => {
    const m: ItemMeasurements = {
      values: {
        adjustable_min_length: { value: 20, unit: "cm" },
        adjustable_max_length: { value: 15, unit: "cm" },
      },
    };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /minimum length cannot exceed/i.test(i.message))).toBe(true);
  });

  it("accepts adjustable_min_length <= adjustable_max_length", () => {
    const m: ItemMeasurements = {
      values: {
        adjustable_min_length: { value: 16, unit: "cm" },
        adjustable_max_length: { value: 18, unit: "cm" },
      },
    };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(true);
  });

  it("flags excessive precision", () => {
    const m: ItemMeasurements = { values: { length: { value: 5.23789, unit: "mm" } } };
    const result = validateItemMeasurements(m, "Bracelet");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /unrealistic precision/i.test(i.message))).toBe(true);
  });

  it("validates stone measurements separately from item measurements", () => {
    const m: ItemMeasurements = {
      values: { length: { value: 45, unit: "mm" } },
      stones: { length: { value: -5, unit: "mm" } },
    };
    const result = validateItemMeasurements(m, "Ring");
    const stoneIssue = result.issues.find((i) => i.field === "stones.length");
    expect(stoneIssue).toBeDefined();
  });

  it("includes the row number in formatted output", () => {
    const m: ItemMeasurements = {};
    const result = validateItemMeasurements(m, "Ring", 124);
    const text = formatValidationIssues(result.issues);
    expect(text).toContain("Row 124:");
  });
});
