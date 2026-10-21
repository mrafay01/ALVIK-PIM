import { formatPoNumber, poNumberFromFileName } from "./poNumber";

describe("formatPoNumber", () => {
  it("prefixes a typed number once", () => {
    expect(formatPoNumber("22906")).toBe("PO-22906");
    expect(formatPoNumber(" PO-22906 ")).toBe("PO-22906");
    expect(formatPoNumber("po-22906")).toBe("PO-22906");
  });

  it("returns null when nothing was typed", () => {
    expect(formatPoNumber("")).toBeNull();
    expect(formatPoNumber("PO-")).toBeNull();
    expect(formatPoNumber(undefined)).toBeNull();
  });
});

describe("poNumberFromFileName", () => {
  it("prefixes the file name without its extension", () => {
    expect(poNumberFromFileName("22906.xlsx")).toBe("PO-22906");
    expect(poNumberFromFileName("23101.xls")).toBe("PO-23101");
    expect(poNumberFromFileName("Spring order 4.csv")).toBe("PO-Spring order 4");
  });

  it("only drops the last extension", () => {
    expect(poNumberFromFileName("22906.v2.xlsx")).toBe("PO-22906.v2");
  });

  it("doesn't double an existing PO- prefix", () => {
    expect(poNumberFromFileName("PO-22906.xlsx")).toBe("PO-22906");
    expect(poNumberFromFileName("po-22906.xlsx")).toBe("PO-22906");
  });

  it("ignores any folder part and returns null for an empty name", () => {
    expect(poNumberFromFileName("C:\\fakepath\\22906.xlsx")).toBe("PO-22906");
    expect(poNumberFromFileName(".xlsx")).toBeNull();
    expect(poNumberFromFileName("   ")).toBeNull();
  });
});
