import { inferSubfolder } from "./client";
import { isObjectId } from "@/lib/ids";

describe("inferSubfolder", () => {
  it("routes by suffix", () => {
    expect(inferSubfolder("A1234", "A1234.jpg")).toBe("Main");
    expect(inferSubfolder("A1234", "A1234-S2.png")).toBe("Sides");
    expect(inferSubfolder("A1234", "a1234-m1.JPG")).toBe("Models");
    expect(inferSubfolder("A1234", "A1234-LS1.jpg")).toBe("Lifestyle");
    expect(inferSubfolder("A1234", "a1234-ls12.png")).toBe("Lifestyle");
  });

  it("rejects files named for a different item", () => {
    expect(() => inferSubfolder("A1234", "B9999.jpg")).toThrow(/must start with the item number/);
    expect(() => inferSubfolder("A1234", "IMG.jpg")).toThrow(/must start with the item number/);
  });

  it("rejects unknown suffixes", () => {
    expect(() => inferSubfolder("A1234", "A1234-final.jpg")).toThrow(/convention/);
    expect(() => inferSubfolder("A1234", "A1234-L1.jpg")).toThrow(/convention/);
    expect(() => inferSubfolder("A1234", "A1234-LS.jpg")).toThrow(/convention/);
  });
});

describe("isObjectId", () => {
  it("accepts 24-hex ids only", () => {
    expect(isObjectId("652f1c2b9d3e4a0012345678")).toBe(true);
    expect(isObjectId("not-an-id")).toBe(false);
    expect(isObjectId("aaaaaaaaaaaa")).toBe(false);
    expect(isObjectId(undefined)).toBe(false);
  });
});
