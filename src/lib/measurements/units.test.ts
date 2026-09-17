import { convertLength, convertWeight, convertMeasurementValue, roundForDisplay } from "./units";

describe("convertLength", () => {
  it("converts inches to cm without rounding the source", () => {
    expect(convertLength(18, "in", "cm")).toBeCloseTo(45.72, 5);
  });

  it("returns the same value when units match", () => {
    expect(convertLength(5.237, "mm", "mm")).toBe(5.237);
  });

  it("converts mm to in", () => {
    expect(convertLength(25.4, "mm", "in")).toBeCloseTo(1, 5);
  });
});

describe("convertWeight", () => {
  it("converts grams to troy ounces", () => {
    expect(convertWeight(31.1034768, "g", "ozt")).toBeCloseTo(1, 5);
  });

  it("keeps oz and ozt distinct", () => {
    const oz = convertWeight(1, "oz", "g");
    const ozt = convertWeight(1, "ozt", "g");
    expect(oz).not.toBeCloseTo(ozt, 2);
  });
});

describe("convertMeasurementValue", () => {
  it("throws when mixing length and weight units", () => {
    expect(() => convertMeasurementValue(5, "mm", "g")).toThrow();
  });
});

describe("roundForDisplay", () => {
  it("does not mutate precision beyond display rounding", () => {
    expect(roundForDisplay(5.23678, "mm")).toBe(5.24);
  });

  it("rounds weight to 3 decimals", () => {
    expect(roundForDisplay(1.23456, "g")).toBe(1.235);
  });
});
