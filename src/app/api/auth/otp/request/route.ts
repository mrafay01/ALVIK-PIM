import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { issueOtp } from "@/lib/otp";
import User from "@/models/User";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Step 1 of login: verify password, email a one-time code. Deliberately
// does NOT create a session — that only happens after /otp/verify's
// ticket is redeemed inside NextAuth's authorize(). Same password check as
// authorize() itself; this route exists only to trigger the OTP send
// without prematurely signing the user in.
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const perEmail = rateLimit(`otp-request:email:${email}`, { limit: 5, windowMs: 60_000 });
  const perIp = rateLimit(`otp-request:ip:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!perEmail.allowed || !perIp.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const user = await User.findOne({ email, active: true });

  // Same response whether the account doesn't exist, is inactive, or the
  // password is wrong — don't let this endpoint confirm which emails have
  // accounts.
  const genericOk = NextResponse.json({ sent: true });
  if (!user) return genericOk;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return genericOk;

  await issueOtp(user._id, user.email);
  return genericOk;
}
