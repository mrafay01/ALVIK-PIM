import { fixRowField } from "./commitRows";
import { masterFileFieldLabel } from "./parseMasterFile";

describe("fixRowField", () => {
  const row = {
    coerced: { itemNumber: "A1", title: "Ring" },
    flags: [
      { field: "pricing.msrp", message: 'Non-numeric value "abc"', rawValue: "abc" },
      { field: "specs.metal", message: "Unrecognized metal value", rawValue: "Tin" },
    ],
  };

  it("clears the flag when the corrected value is valid", () => {
    const out = fixRowField(row, "pricing.msrp", "$42.50");
    expect(out.coerced["pricing.msrp"]).toBe(42.5);
    expect(out.flags.map((f) => f.field)).toEqual(["specs.metal"]);
  });

  it("keeps the field flagged when the value is still invalid", () => {
    const out = fixRowField(row, "pricing.msrp", "about forty");
    expect(out.flags.filter((f) => f.field === "pricing.msrp")).toHaveLength(1);
    expect(out.coerced["pricing.msrp"]).toBeUndefined();
  });

  it("normalizes known metals", () => {
    const out = fixRowField(row, "specs.metal", "sterling silver");
    expect(out.coerced["specs.metal"]).toBe("Silver");
    expect(out.flags.some((f) => f.field === "specs.metal")).toBe(false);
  });

  it("requires a SKU", () => {
    expect(fixRowField({ coerced: {}, flags: [] }, "itemNumber", "").flags[0].field).toBe("itemNumber");
    expect(fixRowField({ coerced: {}, flags: [] }, "itemNumber", "B7").flags).toEqual([]);
  });

  it("labels fields for people", () => {
    expect(masterFileFieldLabel("pricing.msrp")).toBe("MSRP");
    expect(masterFileFieldLabel("specs.newMsrpDate")).toBe("Date (new MSRP)");
  });
});
