import { buildCsv, neutralizeFormula } from "./writeCsv";

describe("CSV formula injection", () => {
  it("neutralizes text Excel would run as a formula", () => {
    expect(neutralizeFormula('=HYPERLINK("http://x","click")')).toBe('\'=HYPERLINK("http://x","click")');
    expect(neutralizeFormula("+cmd")).toBe("'+cmd");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("-2+3")).toBe("'-2+3");
    expect(neutralizeFormula("\tx")).toBe("'\tx");
  });

  it("leaves ordinary values alone, including negative numbers", () => {
    expect(neutralizeFormula("Sterling silver ring")).toBe("Sterling silver ring");
    expect(neutralizeFormula("-5")).toBe("-5");
    expect(neutralizeFormula("-1.25")).toBe("-1.25");
    expect(neutralizeFormula("A1234-GP")).toBe("A1234-GP");
  });

  it("still quotes cells with commas and quotes", () => {
    expect(buildCsv(["a"], [["=1,2"], [12], ['say "hi"']])).toBe('a\r\n"\'=1,2"\r\n12\r\n"say ""hi"""\r\n');
  });
});
