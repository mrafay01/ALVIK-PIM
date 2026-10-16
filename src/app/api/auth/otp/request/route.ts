import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rateLimit";
import { issueOtp, OtpDeliveryError, otpDeliveryFailed } from "@/lib/otp";
import { verifyCredentials } from "@/lib/credentials";
import { clientIp } from "@/lib/clientIp";
import logger from "@/lib/logger";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// Step 1 of login: verify password, email a one-time code. Does NOT create a
// session — that only happens after /otp/verify's ticket is redeemed inside
// NextAuth's authorize().
//
// A wrong password and an unknown email get the SAME 401 and the same
// response time (verifyCredentials compares against a dummy hash when the
// account doesn't exist), so this can't be used to discover accounts. The
// previous version answered "code sent" even for a wrong password, which hid
// nothing extra but left users waiting for an email that never came.
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const ip = clientIp(req.headers);
  const [perEmail, perIp] = await Promise.all([
    rateLimit(`otp-request:email:${email}`, { limit: 5, windowMs: 60_000 }),
    rateLimit(`otp-request:ip:${ip}`, { limit: 20, windowMs: 60_000 }),
  ]);
  if (!perEmail.allowed || !perIp.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(Math.max(perEmail.retryAfterSeconds, perIp.retryAfterSeconds)) } }
    );
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    logger.warn("OTP request: invalid credentials", { email, ip });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  try {
    await issueOtp(user._id, user.email);
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      logger.error("OTP request: email delivery failed", { email, error: err.message });
      return otpDeliveryFailed();
    }
    throw err;
  }
  return NextResponse.json({ sent: true });
}
