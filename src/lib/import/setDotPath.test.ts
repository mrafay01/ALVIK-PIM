import { setDotPath } from "@/lib/import/setDotPath";

describe("setDotPath", () => {
  it("sets nested values", () => {
    const o: Record<string, unknown> = {};
    setDotPath(o, "specs.weight.totalG", 3);
    expect(o).toEqual({ specs: { weight: { totalG: 3 } } });
  });
  it("refuses prototype keys", () => {
    const o: Record<string, unknown> = {};
    setDotPath(o, "__proto__.polluted", "yes");
    setDotPath(o, "constructor.prototype.polluted", "yes");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(o)).toEqual([]);
  });
});
