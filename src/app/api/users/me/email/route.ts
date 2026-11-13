import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { issueOtp, redeemSessionTicket, getVerifiedTargetEmail, OtpDeliveryError, otpDeliveryFailed } from "@/lib/otp";
import { ChangeEmailRequestSchema, ChangeEmailConfirmSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";
import { sendSecurityNoticeAfterResponse } from "@/lib/notifications/security";

// POST: step 1 of a self-service email change. Verifies the caller's
// current password and that the new address isn't already someone else's
// account, then emails a 2FA code to the NEW address — proving the caller
// actually controls it before it becomes their sign-in identity. Nothing
// is written yet.
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = ChangeEmailRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { currentPassword, newEmail } = parsed.data;

  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perUser = await rateLimit(`change-email-request:${userId}`, { limit: 5, windowMs: 60_000 });
  if (!perUser.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const user = await User.findById(userId).select("passwordHash email");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  if (newEmail === user.email) {
    return NextResponse.json({ error: "That's already your current email" }, { status: 400 });
  }
  const taken = await User.findOne({ email: newEmail }).select("_id").lean();
  if (taken) return NextResponse.json({ error: "That email is already in use" }, { status: 400 });

  try {
    await issueOtp(user._id, newEmail, "change_email", newEmail);
  } catch (err) {
    if (err instanceof OtpDeliveryError) return otpDeliveryFailed();
    throw err;
  }
  return NextResponse.json({ sent: true });
}

// PATCH: step 2 — applies the new email once the caller holds a
// sessionTicket proving they verified the code sent to it. The actual
// address written is re-read from the verified OTP record itself (see
// getVerifiedTargetEmail), never taken from the request body — so a
// tampered request can't apply a different address than the one the code
// was actually sent to and verified for.
export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = ChangeEmailConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { sessionTicket } = parsed.data;

  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const ticketOk = await redeemSessionTicket(userObjectId, sessionTicket, "change_email");
  if (!ticketOk) {
    return NextResponse.json({ error: "Verification expired or already used. Start over." }, { status: 400 });
  }

  const newEmail = await getVerifiedTargetEmail(userObjectId, sessionTicket);
  if (!newEmail) {
    return NextResponse.json({ error: "Could not determine the verified email. Start over." }, { status: 400 });
  }

  // Re-check for a race: someone else could have claimed this email in the
  // window between request and confirm. Vendor.name-style unique index on
  // User.email is the hard backstop; this is just a friendlier error.
  const taken = await User.findOne({ email: newEmail, _id: { $ne: userObjectId } }).select("_id").lean();
  if (taken) return NextResponse.json({ error: "That email was taken by another account in the meantime" }, { status: 409 });

  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const oldEmail = user.email;
  user.email = newEmail;
  try {
    await user.save();
  } catch (err) {
    // Lost a race for the address: the unique index refuses it.
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "That email was taken by another account in the meantime" }, { status: 409 });
    }
    throw err;
  }
  // Told at the OLD address: that's where someone whose email was taken
  // over would notice it.
  sendSecurityNoticeAfterResponse(oldEmail, { kind: "email_changed", newEmail });

  return NextResponse.json({ ok: true, email: user.email });
}
