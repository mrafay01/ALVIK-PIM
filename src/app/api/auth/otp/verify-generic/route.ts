import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { verifyOtp } from "@/lib/otp";
import { OtpVerifyGenericSchema, badRequest } from "@/lib/schemas";

const REASON_MESSAGE: Record<string, string> = {
  invalid: "That code isn't right. Check your email and try again.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many wrong attempts. Request a new code.",
  none_pending: "No verification code is pending. Request a new one.",
};

// Shared verify step for every 2FA-gated account-security action other
// than login itself (change_password, admin_reset, change_email — see
// OTP_PURPOSES): checks the code the caller emailed themselves against the
// most recent pending OTP for (their own session's userId, purpose), and
// on success returns a short-lived sessionTicket. That ticket, not the raw
// code, is what the corresponding .../request+confirm route pair actually
// accepts to perform the guarded write — see ChangePasswordConfirmSchema
// etc. Always scoped to the CALLER's own session id, even for admin_reset
// (the admin is proving their own identity there, never the target's).
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = OtpVerifyGenericSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { purpose, code } = parsed.data;

  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perUser = rateLimit(`otp-verify-generic:${userId}:${purpose}`, { limit: 10, windowMs: 60_000 });
  if (!perUser.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const result = await verifyOtp(new Types.ObjectId(userId), code, purpose);
  if (!result.ok) {
    return NextResponse.json({ error: REASON_MESSAGE[result.reason] }, { status: 400 });
  }

  return NextResponse.json({ sessionTicket: result.sessionTicket });
}
