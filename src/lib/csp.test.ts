import { buildCsp, newNonce } from "@/lib/csp";

describe("buildCsp", () => {
  it("allows scripts by nonce and never by unsafe-inline", () => {
    const csp = buildCsp("abc123", true);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  });
  it("only dev may use eval (React Refresh)", () => {
    expect(buildCsp("n", false)).toContain("'unsafe-eval'");
  });
  it("keeps the framing, object and form protections", () => {
    const csp = buildCsp("n", true);
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "upgrade-insecure-requests"]) {
      expect(csp).toContain(d);
    }
  });
  it("only asks browsers to upgrade requests when served over https", () => {
    expect(buildCsp("n", true, false)).not.toContain("upgrade-insecure-requests");
    expect(buildCsp("n", true, true)).toContain("upgrade-insecure-requests");
  });
  it("nonces are unique per call", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
