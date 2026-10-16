import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { UserPatchSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";
import { isObjectId } from "@/lib/ids";

// GET: single user detail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { userId } = await params;
  if (!isObjectId(userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const user = await User.findById(userId).select("name email role active createdAt updatedAt").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user });
}

// PATCH: change a user's name, role, or active flag. Admin only. An admin
// can't demote or deactivate their own account here — that's a
// self-lockout risk with no upside; have another admin do it. Password
// reset lives at .../reset-password (2FA-gated), not here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { userId } = await params;
  if (!isObjectId(userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = UserPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  const isSelf = session.user?.id === userId;
  if (isSelf && (body.role !== undefined || body.active !== undefined)) {
    return NextResponse.json(
      { error: "You can't change your own role or active status. Ask another administrator" },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (body.name !== undefined) user.name = body.name;
  if (body.role !== undefined && body.role !== user.role) {
    user.role = body.role;
    // The role is stamped into the user's login cookie when they sign in,
    // so a change only takes effect on their next sign-in. Bumping the
    // session version signs them out everywhere right away (see the jwt
    // callback in lib/auth.ts) instead of leaving the old role's access
    // live until the cookie expires.
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  }
  if (body.active !== undefined) user.active = body.active;

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
