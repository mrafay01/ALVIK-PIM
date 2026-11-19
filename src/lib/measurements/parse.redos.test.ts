import { parseSingleMeasurement, parseDimensionPair } from "@/lib/measurements/parse";

describe("measurement parsing stays fast on hostile cells", () => {
  const hostile = "1" + " ".repeat(20_000) + "!";

  it("a number, thousands of spaces and a stray character is rejected immediately", () => {
    const t = Date.now();
    expect(parseSingleMeasurement(hostile, { dimension: "length" }).unrecognized).toBe(true);
    expect(parseDimensionPair("1x1" + " ".repeat(20_000) + "!").unrecognized).toBe(true);
    expect(Date.now() - t).toBeLessThan(200);
  });

  it("a short cell with the same shape is also linear", () => {
    const t = Date.now();
    parseSingleMeasurement("1" + " ".repeat(90) + "!", { dimension: "length" });
    expect(Date.now() - t).toBeLessThan(50);
  });

  it("still reads normal values the way it did", () => {
    const len = (s: string) => parseSingleMeasurement(s, { dimension: "length" });
    expect(len("18 in").measurement?.value).toBe(18);
    expect(len("45cm").measurement?.value).toBe(45);
    expect(len('18"').measurement?.value).toBe(18);
    expect(len("  450 mm  ").measurement?.value).toBe(450);
    expect(len("").unrecognized).toBe(false);
    expect(len("abc").unrecognized).toBe(true);
    expect(parseDimensionPair("5 x 4 mm").first?.value).toBe(5);
    expect(parseDimensionPair("5×4mm").second?.value).toBe(4);
  });
});
