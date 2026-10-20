import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isAuthFail } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import { rateLimit } from "@/lib/rateLimit";
import { sendSupportEmail } from "@/lib/mailer";
import { SUPPORT_CONTACT, SUPPORT_TOPICS } from "@/lib/support";
import logger from "@/lib/logger";

const BodySchema = z.object({
  topic: z.enum(SUPPORT_TOPICS.map((t) => t.value) as [string, ...string[]]),
  subject: z.string().trim().min(3, "Add a short subject").max(150),
  message: z.string().trim().min(10, "Describe the problem in a sentence or two").max(5000),
  pageUrl: z.string().trim().max(300).optional(),
});

// POST: send a Help & Support message to the developer. Any signed-in user.
export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;
  const user = gate.session.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  const limit = await rateLimit(`support:${user.email}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've sent several messages in the last hour. Please wait a bit, or email directly." },
      { status: 429 }
    );
  }

  const topicLabel = SUPPORT_TOPICS.find((t) => t.value === parsed.data.topic)?.label ?? parsed.data.topic;
  try {
    await sendSupportEmail({
      to: process.env.SUPPORT_EMAIL?.trim() || SUPPORT_CONTACT.email,
      fromName: user.name ?? user.email,
      fromEmail: user.email,
      role: (gate.role ?? "").replace(/_/g, " "),
      topic: topicLabel,
      subject: parsed.data.subject,
      message: parsed.data.message,
      pageUrl: parsed.data.pageUrl,
    });
  } catch (err) {
    logger.error("support message failed to send", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: `Couldn't send right now. Please email ${SUPPORT_CONTACT.email} directly.` },
      { status: 502 }
    );
  }
  logger.info("support message sent", { from: user.email, topic: parsed.data.topic });
  return NextResponse.json({ sent: true });
}
