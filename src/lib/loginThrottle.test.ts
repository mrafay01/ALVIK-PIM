import { checkLoginThrottle, recordLoginFailure } from "@/lib/loginThrottle";
import { rateLimit, peekRateLimit } from "@/lib/rateLimit";

jest.mock("@/lib/rateLimit", () => ({ rateLimit: jest.fn(), peekRateLimit: jest.fn() }));

const ok = { allowed: true, remaining: 1, retryAfterSeconds: 0 };
const denied = { allowed: false, remaining: 0, retryAfterSeconds: 42 };
const rl = rateLimit as jest.Mock;
const peek = peekRateLimit as jest.Mock;

beforeEach(() => {
  rl.mockReset().mockResolvedValue(ok);
  peek.mockReset().mockResolvedValue(ok);
});

describe("login throttle", () => {
  it("a normal attempt is let through and only the IP counter is incremented", async () => {
    const t = await checkLoginThrottle("a@x.com", "1.1.1.1");
    expect(t.blocked).toBe(false);
    expect(rl).toHaveBeenCalledTimes(1);
    expect(rl.mock.calls[0][0]).toBe("login:ip:1.1.1.1");
  });

  it("checking never counts against the account, so spamming bad requests can't be what locks it", async () => {
    await checkLoginThrottle("a@x.com", "1.1.1.1");
    expect(rl.mock.calls.some(([k]) => String(k).includes("a@x.com"))).toBe(false);
  });

  it("failures count against both the (email, IP) pair and the email", async () => {
    await recordLoginFailure("a@x.com", "1.1.1.1");
    const keys = rl.mock.calls.map(([k]) => k);
    expect(keys).toEqual(["login-fail:pair:a@x.com|1.1.1.1", "login-fail:email:a@x.com"]);
  });

  it("blocks when the attacker's own pair is over its limit, with the longest wait", async () => {
    peek.mockResolvedValueOnce(denied).mockResolvedValueOnce(ok);
    const t = await checkLoginThrottle("a@x.com", "6.6.6.6");
    expect(t).toEqual({ blocked: true, retryAfterSeconds: 42 });
  });

  it("blocks on the distributed per-email cap and on the per-IP cap", async () => {
    peek.mockResolvedValueOnce(ok).mockResolvedValueOnce(denied);
    expect((await checkLoginThrottle("a@x.com", "2.2.2.2")).blocked).toBe(true);
    rl.mockResolvedValueOnce(denied);
    expect((await checkLoginThrottle("b@x.com", "3.3.3.3")).blocked).toBe(true);
  });
});
