import { rateLimit } from "@/lib/rateLimit";
import RateLimit from "@/models/RateLimit";

// MongoDB-backed rate limiter — stubs the model's findOneAndUpdate so the
// test exercises the increment/retry logic without a live DB. The previous
// in-memory version tested the Map state directly; here we drive the
// counter the same way the real backing store would.

jest.mock("@/lib/db", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

type MockDoc = { count: number } | null;

function mockLimiterCounts(counts: number[]) {
  const chain = (value: MockDoc) => ({ lean: jest.fn().mockResolvedValue(value) });
  const spy = jest.spyOn(RateLimit, "findOneAndUpdate" as never) as unknown as jest.Mock;
  spy.mockReset();
  for (const c of counts) spy.mockReturnValueOnce(chain({ count: c }));
  return spy;
}

describe("rateLimit", () => {
  afterEach(() => jest.restoreAllMocks());

  it("allows the first request within limit", async () => {
    mockLimiterCounts([1]);
    const result = await rateLimit("test-key", { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("tracks multiple requests within limit, then denies at limit+1", async () => {
    mockLimiterCounts([1, 2, 3, 4]);
    const opts = { limit: 3, windowMs: 60000 };
    expect((await rateLimit("k", opts)).allowed).toBe(true);
    expect((await rateLimit("k", opts)).allowed).toBe(true);
    expect((await rateLimit("k", opts)).allowed).toBe(true);
    const over = await rateLimit("k", opts);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("fails open when the backing store throws", async () => {
    const spy = jest.spyOn(RateLimit, "findOneAndUpdate" as never) as unknown as jest.Mock;
    spy.mockReset();
    spy.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const result = await rateLimit("key", { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
  });
});