import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { UserCreateSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

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
  let user;
  try {
    user = await User.create({ name, email, passwordHash, role, active: true });
  } catch (err) {
    // Two admins adding the same email at once: the unique index catches
    // what the findOne above couldn't.
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }
    throw err;
  }

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
