import { rateLimit } from "@/lib/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should allow first request within limit", () => {
    const result = rateLimit("test-key", { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("should track multiple requests within limit", () => {
    const key = "test-key-2";
    const limit = { limit: 3, windowMs: 60000 };

    const r1 = rateLimit(key, limit);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit(key, limit);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(key, limit);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = rateLimit(key, limit);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("should distinguish between different keys", () => {
    const limit = { limit: 2, windowMs: 60000 };

    const r1 = rateLimit("key-1", limit);
    expect(r1.allowed).toBe(true);

    const r2 = rateLimit("key-2", limit);
    expect(r2.allowed).toBe(true);

    const r3 = rateLimit("key-1", limit);
    expect(r3.allowed).toBe(true);

    const r4 = rateLimit("key-1", limit);
    expect(r4.allowed).toBe(false);

    const r5 = rateLimit("key-2", limit);
    expect(r5.allowed).toBe(true);
  });

  it("should provide retry-after duration when limit exceeded", () => {
    const key = "test-retry";
    const limit = { limit: 1, windowMs: 60000 };

    rateLimit(key, limit); // First request
    const result = rateLimit(key, limit); // Second request (over limit)

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
