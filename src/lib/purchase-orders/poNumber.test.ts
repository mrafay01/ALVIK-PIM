import { formatPoNumber, poNumberFromFileName } from "./poNumber";

describe("formatPoNumber", () => {
  it("stores the bare number, the way Monday names the PO", () => {
    expect(formatPoNumber("22906")).toBe("22906");
    expect(formatPoNumber(" PO-22906 ")).toBe("22906");
    expect(formatPoNumber("po-22906")).toBe("22906");
    expect(formatPoNumber("PO 22906")).toBe("22906");
    expect(formatPoNumber("PO#22906")).toBe("22906");
    expect(formatPoNumber("PO22906")).toBe("22906");
    expect(formatPoNumber("#22906")).toBe("22906");
    expect(formatPoNumber("22906#")).toBe("22906");
  });

  it("leaves names that only start with the letters PO alone", () => {
    expect(formatPoNumber("POLO-5")).toBe("POLO-5");
    expect(formatPoNumber("Q-1A2B3C")).toBe("Q-1A2B3C");
  });

  it("returns null when nothing was typed", () => {
    expect(formatPoNumber("")).toBeNull();
    expect(formatPoNumber("PO-")).toBeNull();
    expect(formatPoNumber("#")).toBeNull();
    expect(formatPoNumber(undefined)).toBeNull();
  });
});

describe("poNumberFromFileName", () => {
  it("uses the file name without its extension", () => {
    expect(poNumberFromFileName("22906.xlsx")).toBe("22906");
    expect(poNumberFromFileName("PO-22906.xlsx")).toBe("22906");
    expect(poNumberFromFileName("23101.xls")).toBe("23101");
    expect(poNumberFromFileName("Spring order 4.csv")).toBe("Spring order 4");
  });

  it("only drops the last extension", () => {
    expect(poNumberFromFileName("22906.v2.xlsx")).toBe("22906.v2");
  });

  it("ignores any folder part and returns null for an empty name", () => {
    expect(poNumberFromFileName("C:\\fakepath\\22906.xlsx")).toBe("22906");
    expect(poNumberFromFileName(".xlsx")).toBeNull();
    expect(poNumberFromFileName("   ")).toBeNull();
  });
});
