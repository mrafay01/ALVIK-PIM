import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { NotificationPrefsPatchSchema, badRequest } from "@/lib/schemas";
import { canReceive, type NotificationEvent } from "@/lib/notifications/events";
import type { Role } from "@/lib/enums";
import User from "@/models/User";

// PATCH: turn one or more of the caller's own notification emails on or
// off. Only email types the caller's role can receive are accepted.
export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const parsed = NotificationPrefsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const changes = Object.entries(parsed.data) as [NotificationEvent, boolean][];

  const role = gate.role as Role;
  const notForRole = changes.filter(([key]) => !canReceive(key, role));
  if (notForRole.length > 0) {
    return NextResponse.json({ error: "That notification isn't available for your role" }, { status: 400 });
  }

  await connectDB();
  const set = Object.fromEntries(changes.map(([key, value]) => [`notificationPrefs.${key}`, value]));
  const user = await User.findByIdAndUpdate(gate.session.user?.id, { $set: set }, { new: true })
    .select("notificationPrefs")
    .lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ notificationPrefs: user.notificationPrefs ?? {} });
}
