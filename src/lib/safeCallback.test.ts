import { safeCallbackPath } from "./safeCallback";

describe("safeCallbackPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeCallbackPath("/catalog?filter=pending")).toBe("/catalog?filter=pending");
    expect(safeCallbackPath("/purchase-orders/abc")).toBe("/purchase-orders/abc");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "/\\\\evil.com",
      "https://evil.com",
      "evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeCallbackPath(bad)).toBeNull();
    }
  });

  it("refuses the login page and API routes", () => {
    expect(safeCallbackPath("/login?x=1")).toBeNull();
    expect(safeCallbackPath("/api/items/1")).toBeNull();
    expect(safeCallbackPath("/./api/items")).toBeNull();
  });
});
