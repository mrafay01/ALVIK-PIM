import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { verifyOtp } from "@/lib/otp";
import { clientIp } from "@/lib/clientIp";
import User from "@/models/User";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/, "must be a 6-digit code"),
});

const REASON_MESSAGE: Record<string, string> = {
  invalid: "That code isn't right. Check your email and try again.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many wrong attempts. Request a new code.",
  none_pending: "No verification code is pending for this account. Request a new one.",
};

// Step 2 of login: check the emailed code, and on success return a
// short-lived session ticket the client immediately hands to NextAuth's
// signIn("credentials", ...) call to actually complete login.
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 6-digit code from the email." }, { status: 400 });
  }
  const { email, code } = parsed.data;

  const ip = clientIp(req.headers);
  const [perEmail, perIp] = await Promise.all([
    rateLimit(`otp-verify:email:${email}`, { limit: 10, windowMs: 60_000 }),
    rateLimit(`otp-verify:ip:${ip}`, { limit: 30, windowMs: 60_000 }),
  ]);
  if (!perEmail.allowed || !perIp.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const user = await User.findOne({ email, active: true }).select("_id").lean();
  if (!user) {
    return NextResponse.json({ error: REASON_MESSAGE.none_pending }, { status: 400 });
  }

  const result = await verifyOtp(user._id, code);
  if (!result.ok) {
    return NextResponse.json({ error: REASON_MESSAGE[result.reason], reason: result.reason }, { status: 400 });
  }

  return NextResponse.json({ sessionTicket: result.sessionTicket });
}
