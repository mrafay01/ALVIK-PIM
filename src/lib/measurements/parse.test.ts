import { parseSingleMeasurement, parseDimensionPair } from "./parse";

describe("parseSingleMeasurement — length", () => {
  const cases: [string, number, string][] = [
    ["18 in", 18, "in"],
    ['18"', 18, "in"],
    ["18 inches", 18, "in"],
    ["45 cm", 45, "cm"],
    ["45cm", 45, "cm"],
    ["450 mm", 450, "mm"],
    ["450mm", 450, "mm"],
  ];
  it.each(cases)("parses %s", (raw, value, unit) => {
    const result = parseSingleMeasurement(raw, { dimension: "length" });
    expect(result.unrecognized).toBe(false);
    expect(result.measurement?.value).toBe(value);
    expect(result.measurement?.unit).toBe(unit);
  });

  it("preserves the original raw text", () => {
    const result = parseSingleMeasurement("18 inches", { dimension: "length" });
    expect(result.measurement?.originalValue).toBe("18 inches");
  });

  it("does not guess a unit for a bare number with no default", () => {
    const result = parseSingleMeasurement("18", { dimension: "length" });
    expect(result.unrecognized).toBe(true);
    expect(result.measurement).toBeNull();
  });

  it("uses the default unit when one is supplied and none is given in text", () => {
    const result = parseSingleMeasurement("18", { dimension: "length", defaultUnit: "mm" });
    expect(result.unrecognized).toBe(false);
    expect(result.measurement?.unit).toBe("mm");
  });

  it("returns null (not an error) for empty/blank input", () => {
    expect(parseSingleMeasurement("", { dimension: "length" })).toEqual({
      measurement: null,
      unrecognized: false,
    });
    expect(parseSingleMeasurement(null, { dimension: "length" })).toEqual({
      measurement: null,
      unrecognized: false,
    });
  });

  it("flags unparseable text", () => {
    const result = parseSingleMeasurement("abc", { dimension: "length" });
    expect(result.unrecognized).toBe(true);
  });
});

describe("parseSingleMeasurement — weight", () => {
  it("parses grams", () => {
    const result = parseSingleMeasurement("5.2 g", { dimension: "weight" });
    expect(result.measurement?.value).toBe(5.2);
    expect(result.measurement?.unit).toBe("g");
  });

  it("parses troy ounces", () => {
    const result = parseSingleMeasurement("1 ozt", { dimension: "weight" });
    expect(result.measurement?.unit).toBe("ozt");
  });
});

describe("parseDimensionPair", () => {
  it("parses '5 x 4 mm' into two length measurements", () => {
    const result = parseDimensionPair("5 x 4 mm");
    expect(result.unrecognized).toBe(false);
    expect(result.first).toEqual({ value: 5, unit: "mm", originalValue: "5 x 4 mm", source: "supplier" });
    expect(result.second).toEqual({ value: 4, unit: "mm", originalValue: "5 x 4 mm", source: "supplier" });
  });

  it("parses the × character", () => {
    const result = parseDimensionPair("5×4mm");
    expect(result.unrecognized).toBe(false);
    expect(result.first?.value).toBe(5);
    expect(result.second?.value).toBe(4);
  });

  it("does not silently invent a unit — defaults to mm only for this explicit dimension-pair path", () => {
    const result = parseDimensionPair("5 x 4");
    expect(result.unrecognized).toBe(false);
    expect(result.first?.unit).toBe("mm");
  });

  it("flags malformed dimension pairs", () => {
    const result = parseDimensionPair("5 by 4");
    expect(result.unrecognized).toBe(true);
  });
});
