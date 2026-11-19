import { hasFullAccess, ROLES } from "@/lib/enums";

describe("hasFullAccess", () => {
  it("is true for the administrator and the developer only", () => {
    for (const r of ROLES) expect(hasFullAccess(r)).toBe(r === "administrator" || r === "developer");
  });
  it("is false when there is no role", () => {
    expect(hasFullAccess(undefined)).toBe(false);
    expect(hasFullAccess(null)).toBe(false);
    expect(hasFullAccess("")).toBe(false);
  });
});
