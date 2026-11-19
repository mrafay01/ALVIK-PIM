import { rateLimit, peekRateLimit } from "@/lib/rateLimit";

// Brute-force protection for password sign-in (NextAuth authorize() and the
// OTP request step share it, so using both endpoints doesn't double the
// allowance).
//
// Only FAILED attempts count against an account. The old limiter counted
// every attempt per email, so anyone who knew an address could send five
// bad requests a minute and keep its owner permanently locked out. Now:
//   - pair   (email + client IP): tight. The attacker's own IP is locked
//             out quickly; the real owner, on another IP, is unaffected.
//   - email  (any IP): loose and long-windowed. It caps a distributed
//             guessing attack without a minute of spam being enough to
//             deny the owner.
//   - ip     (any email): counted on every attempt by the callers, via
//             attemptFromIp, to stop one address spraying many accounts.
const PAIR = { limit: 5, windowMs: 60_000 };
const EMAIL = { limit: 30, windowMs: 15 * 60_000 };
const IP = { limit: 20, windowMs: 60_000 };

const pairKey = (email: string, ip: string) => `login-fail:pair:${email}|${ip}`;
const emailKey = (email: string) => `login-fail:email:${email}`;

export type Throttle = { blocked: boolean; retryAfterSeconds: number };

// Call before checking the password. Counts the attempt against the IP.
export async function checkLoginThrottle(email: string, ip: string): Promise<Throttle> {
  const [perIp, pair, perEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, IP),
    peekRateLimit(pairKey(email, ip), PAIR),
    peekRateLimit(emailKey(email), EMAIL),
  ]);
  const blocked = !perIp.allowed || !pair.allowed || !perEmail.allowed;
  return {
    blocked,
    retryAfterSeconds: Math.max(perIp.retryAfterSeconds, pair.retryAfterSeconds, perEmail.retryAfterSeconds),
  };
}

// Call when the password (or ticket) was wrong.
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await Promise.all([rateLimit(pairKey(email, ip), PAIR), rateLimit(emailKey(email), EMAIL)]);
}
