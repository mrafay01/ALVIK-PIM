import { maskEmail } from "@/lib/logMask";

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("joel@example.com")).toBe("j***@example.com");
  });
  it("never echoes something that isn't an address", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(undefined)).toBe("");
  });
});
