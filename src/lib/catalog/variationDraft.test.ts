import { measurementsDifferFromBase, structuredCloneMeasurements, emptyVariationDraft } from "./variationDraft";
import type { ItemMeasurements } from "@/lib/measurements/types";

describe("measurementsDifferFromBase", () => {
  it("returns false when a variation's measurements exactly match the base", () => {
    const base: ItemMeasurements = { values: { length: { value: 45, unit: "mm" } } };
    const variation = structuredCloneMeasurements(base);
    expect(measurementsDifferFromBase(variation, base)).toBe(false);
  });

  it("returns true when a variation overrides a value the base doesn't have", () => {
    const base: ItemMeasurements = {};
    const variation: ItemMeasurements = { ringSize: { value: 6, system: "US" } };
    expect(measurementsDifferFromBase(variation, base)).toBe(true);
  });

  it("returns true when a variation's field value differs from the base's", () => {
    const base: ItemMeasurements = { values: { length: { value: 45, unit: "mm" } } };
    const variation: ItemMeasurements = { values: { length: { value: 50, unit: "mm" } } };
    expect(measurementsDifferFromBase(variation, base)).toBe(true);
  });

  it("ignores the category field when comparing (category is never per-variation)", () => {
    const base: ItemMeasurements = { category: "Ring", values: { length: { value: 45, unit: "mm" } } };
    const variation: ItemMeasurements = { category: "Ring", values: { length: { value: 45, unit: "mm" } } };
    expect(measurementsDifferFromBase(variation, base)).toBe(false);
  });
});

describe("emptyVariationDraft", () => {
  it("seeds a new variation row with a copy of the base measurements", () => {
    const base: ItemMeasurements = { values: { length: { value: 45, unit: "mm" } } };
    const draft = emptyVariationDraft(base);
    expect(draft.measurements).toEqual(base);
  });

  it("does not let editing the draft's measurements mutate the base object", () => {
    const base: ItemMeasurements = { values: { length: { value: 45, unit: "mm" } } };
    const draft = emptyVariationDraft(base);
    draft.measurements.values!.length = { value: 99, unit: "mm" };
    expect(base.values!.length!.value).toBe(45);
  });
});
