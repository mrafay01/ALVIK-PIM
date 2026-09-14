import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { UserCreateSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// GET: list every user, newest first. Admin only — this is the account
// directory, not a profile lookup any role should be able to hit.
export async function GET() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const users = await User.find({})
    .select("name email role active createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ users });
}

// POST: create a new user with a role and a real, immediately-usable
// password (unlike the seed script, which deliberately issues unusable
// random ones). Admin only — this is the one place account creation and
// role assignment happen.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const parsed = UserCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { name, email, password, role } = parsed.data;

  await connectDB();

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash, role, active: true });

  return NextResponse.json(
    {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
      },
    },
    { status: 201 }
  );
}
