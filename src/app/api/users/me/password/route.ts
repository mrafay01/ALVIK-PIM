import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { ChangePasswordSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// PATCH: self-service password change. Any signed-in user, but only for
// their own account and only after proving they know the current password
// — distinct from the admin "reset password" action in /api/admin/users,
// which an administrator can do to someone else without that proof.
export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = ChangePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { currentPassword, newPassword } = parsed.data;

  await connectDB();
  const user = await User.findById(gate.session.user?.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return NextResponse.json({ ok: true });
}
