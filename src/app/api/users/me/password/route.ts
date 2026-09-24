import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { issueOtp, redeemSessionTicket } from "@/lib/otp";
import { ChangePasswordRequestSchema, ChangePasswordConfirmSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// POST: step 1 of a self-service password change. Verifies the caller's
// current password, then emails a 2FA code to their own account address —
// nothing is written yet. Step 2 is PATCH below, using the sessionTicket
// that /api/auth/otp/verify-generic returns once the code checks out.
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = ChangePasswordRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { currentPassword, newPassword } = parsed.data;

  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perUser = rateLimit(`change-password-request:${userId}`, { limit: 5, windowMs: 60_000 });
  if (!perUser.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const user = await User.findById(userId).select("passwordHash email");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  void newPassword; // validated shape only at this step; re-sent and applied in PATCH below
  await issueOtp(user._id, user.email, "change_password");
  return NextResponse.json({ sent: true });
}

// PATCH: step 2 — applies the new password once the caller holds a
// sessionTicket proving they verified the code from POST above. The
// ticket is scoped to (this user, "change_password") and single-use, so
// it can't be replayed or reused for a different purpose.
export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = ChangePasswordConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { sessionTicket, newPassword } = parsed.data;

  const userId = gate.session.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const ticketOk = await redeemSessionTicket(new Types.ObjectId(userId), sessionTicket, "change_password");
  if (!ticketOk) {
    return NextResponse.json({ error: "Verification expired or already used — start over." }, { status: 400 });
  }

  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return NextResponse.json({ ok: true });
}
