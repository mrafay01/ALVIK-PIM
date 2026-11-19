import { clientIp } from "@/lib/clientIp";

const spoofed = { "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7", "x-vercel-forwarded-for": "8.8.8.8" };

describe("clientIp", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ignores every forwarding header when no trusted proxy is configured", () => {
    delete process.env.VERCEL;
    delete process.env.TRUST_PROXY_HEADERS;
    expect(clientIp(spoofed)).toBe("unknown");
  });

  it("uses the Vercel header on Vercel", () => {
    process.env.VERCEL = "1";
    expect(clientIp(spoofed)).toBe("8.8.8.8");
  });

  it("with TRUST_PROXY_HEADERS, takes the address the proxy appended, not the client's", () => {
    delete process.env.VERCEL;
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(clientIp({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" })).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
  });
});
