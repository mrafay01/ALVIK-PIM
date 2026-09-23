import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { NotificationPrefsPatchSchema, badRequest } from "@/lib/schemas";
import User from "@/models/User";

// GET: the caller's own notification preferences. Any signed-in user —
// unlike /api/admin/users, this is self-service and never touches another
// account.
export async function GET() {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const user = await User.findById(gate.session.user?.id).select("notificationPrefs").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ notificationPrefs: user.notificationPrefs ?? {} });
}

// PATCH: update one or more of the caller's own notification toggles.
export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = NotificationPrefsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  await connectDB();
  const user = await User.findById(gate.session.user?.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  for (const [key, value] of Object.entries(body)) {
    user.set(`notificationPrefs.${key}`, value);
  }
  await user.save();

  return NextResponse.json({ notificationPrefs: user.notificationPrefs });
}
