import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { UserPatchSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// GET: single user detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { userId } = await params;
  await connectDB();
  const user = await User.findById(userId).select("name email role active createdAt updatedAt").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user });
}

// PATCH: change a user's name, role, active flag, or reset their password.
// Admin only. An admin can't demote or deactivate their own account here —
// that's a self-lockout risk with no upside; have another admin do it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { userId } = await params;
  const parsed = UserPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  const isSelf = session.user?.id === userId;
  if (isSelf && (body.role !== undefined || body.active !== undefined)) {
    return NextResponse.json(
      { error: "You can't change your own role or active status — ask another administrator" },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (body.name !== undefined) user.name = body.name;
  if (body.role !== undefined) user.role = body.role;
  if (body.active !== undefined) user.active = body.active;
  if (body.password !== undefined) user.passwordHash = await bcrypt.hash(body.password, 12);

  await user.save();
  return NextResponse.json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
}
