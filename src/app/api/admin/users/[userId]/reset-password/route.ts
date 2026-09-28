import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { issueOtp, redeemSessionTicket } from "@/lib/otp";
import { AdminResetPasswordRequestSchema, AdminResetPasswordConfirmSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// POST: step 1 of an admin resetting a DIFFERENT user's password. The
// admin proves THEIR OWN identity — their own current password — and a
// 2FA code is emailed to the ADMIN's own account address, never the
// target's. Nothing is written to the target account yet.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { userId: targetUserId } = await params;
  const parsed = AdminResetPasswordRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { adminPassword, newPassword } = parsed.data;

  const adminId = session.user?.id;
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perAdmin = rateLimit(`admin-reset-request:${adminId}`, { limit: 5, windowMs: 60_000 });
  if (!perAdmin.allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  await connectDB();
  const target = await User.findById(targetUserId).select("_id").lean();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const admin = await User.findById(adminId).select("passwordHash email");
  if (!admin) return NextResponse.json({ error: "Admin account not found" }, { status: 404 });

  const valid = await bcrypt.compare(adminPassword, admin.passwordHash);
  if (!valid) return NextResponse.json({ error: "Your password is incorrect" }, { status: 400 });

  void newPassword; // validated shape only at this step; re-sent and applied in PATCH below
  await issueOtp(admin._id, admin.email, "admin_reset");
  return NextResponse.json({ sent: true });
}

// PATCH: step 2 — applies the new password to the TARGET user once the
// ADMIN holds a sessionTicket proving they verified the code from POST
// above. The ticket is checked against the ADMIN's own userId (it proves
// the admin's identity, not any claim about the target), then the new
// password is written onto the target account named in the URL.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { userId: targetUserId } = await params;
  const parsed = AdminResetPasswordConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { sessionTicket, newPassword } = parsed.data;

  const adminId = session.user?.id;
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const ticketOk = await redeemSessionTicket(new Types.ObjectId(adminId), sessionTicket, "admin_reset");
  if (!ticketOk) {
    return NextResponse.json({ error: "Verification expired or already used. Start over." }, { status: 400 });
  }

  const target = await User.findById(targetUserId);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  target.passwordHash = await bcrypt.hash(newPassword, 12);
  await target.save();

  return NextResponse.json({ ok: true });
}
