import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isAuthFail } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import { appUrl, renderNotificationEmail } from "@/lib/notifications/email";
import { digestEmail, loadDigestCounts } from "@/lib/notifications/digest";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import type { Role } from "@/lib/enums";
import logger from "@/lib/logger";

const BodySchema = z.object({ kind: z.enum(["test", "digest"]).default("test") });

// POST: send the caller a test email ({ kind: "test" }) or this week's
// summary for their role right now ({ kind: "digest" }), so they can check
// emails reach them (and aren't in spam). 3 an hour per user.
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;
  const user = gate.session.user;
  const role = gate.role as Role;
  if (!user?.email || !user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Unknown test" }, { status: 400 });

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't set up on this server yet, so the app can't send notifications. Ask the developer." },
      { status: 503 }
    );
  }

  const limit = await rateLimit(`notify-test:${user.id}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "You've sent a few test emails already. Try again in an hour." }, { status: 429 });
  }

  const email =
    parsed.data.kind === "digest"
      ? renderNotificationEmail({
          ...digestEmail(role, await loadDigestCounts()),
          reason: "You asked for this summary from Settings → Notifications. The weekly one arrives on Mondays if it's on.",
        })
      : renderNotificationEmail({
          subject: "Test email",
          eyebrow: "Notifications",
          heading: "Your notification emails work",
          intro: `This is a test from Alvik PIM. Notifications for your role (${ROLE_LABEL[role] ?? role}) will arrive at this address. If this landed in spam, mark it as not spam so the real ones reach your inbox.`,
          action: { label: "Open notification settings", href: appUrl("/settings/notifications") },
          reason: "You asked for this test email from Settings → Notifications.",
        });
  try {
    await sendEmail({ to: user.email, ...email });
  } catch (err) {
    logger.error("test notification failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "The email couldn't be sent. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to: user.email });
}
