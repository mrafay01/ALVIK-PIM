import { after } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import logger from "@/lib/logger";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rateLimit";
import type { Role } from "@/lib/enums";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import { NOTIFICATION_EVENTS, isEnabled, type NotificationEvent, type StoredPrefs } from "./events";
import { renderNotificationEmail, type NotificationEmail } from "./email";

// Sends one kind of notification email to everyone who should get it:
// active users whose role can receive it and who haven't turned it off
// (their role's default otherwise). The person who caused it is left out:
// they already know. Each person gets their own email, so nobody sees the
// other recipients.
//
// Never throws: a failed send is logged and counted, and never fails the
// action that triggered it.

export type NotifyInput = {
  event: NotificationEvent;
  email: Omit<NotificationEmail, "reason">;
  // The user who did it (left out of the recipients).
  actorId?: string | null;
  // Send only to these users / roles (still subject to role and preference).
  onlyUserIds?: string[];
  onlyRoles?: Role[];
  // At most one email per key in this window, e.g. one per Monday import
  // run instead of one per 500-item chunk.
  throttle?: { key: string; windowMs: number };
};

export type NotifyResult = { recipients: number; sent: number; failed: number; skipped?: string };

type Recipient = { _id: unknown; email: string; role: Role; notificationPrefs?: StoredPrefs };

const SEND_CONCURRENCY = 4;

// Runs `fn` over `items`, at most `limit` at a time.
export async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function findRecipients(
  input: Pick<NotifyInput, "event" | "actorId" | "onlyUserIds" | "onlyRoles">
): Promise<Recipient[]> {
  const def = NOTIFICATION_EVENTS[input.event];
  const roles = (def.roles as readonly Role[]).filter((r) => !input.onlyRoles || input.onlyRoles.includes(r));
  const filter: Record<string, unknown> = { active: true, role: { $in: roles } };
  if (input.onlyUserIds) filter._id = { $in: input.onlyUserIds };
  await connectDB();
  const users = (await User.find(filter).select("email role notificationPrefs").lean()) as unknown as Recipient[];
  return users.filter(
    (u) => !!u.email && String(u._id) !== String(input.actorId ?? "") && isEnabled(input.event, u.role, u.notificationPrefs)
  );
}

export function reasonFor(event: NotificationEvent, role: Role): string {
  return `You're getting this because "${NOTIFICATION_EVENTS[event].label}" is on in your notification settings (your role: ${ROLE_LABEL[role] ?? role}).`;
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    if (!isMailConfigured()) {
      logger.warn("notification skipped: email (SMTP) is not configured", { event: input.event });
      return { recipients: 0, sent: 0, failed: 0, skipped: "email not configured" };
    }
    if (input.throttle) {
      await connectDB();
      const slot = await rateLimit(`notify:${input.throttle.key}`, { limit: 1, windowMs: input.throttle.windowMs });
      if (!slot.allowed) return { recipients: 0, sent: 0, failed: 0, skipped: "throttled" };
    }
    const recipients = await findRecipients(input);
    let sent = 0;
    let failed = 0;
    await forEachLimited(recipients, SEND_CONCURRENCY, async (r) => {
      const rendered = renderNotificationEmail({ ...input.email, reason: reasonFor(input.event, r.role) });
      try {
        await sendEmail({ to: r.email, ...rendered });
        sent++;
      } catch (err) {
        failed++;
        logger.error("notification email failed", {
          event: input.event,
          userId: String(r._id),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    if (recipients.length > 0) {
      logger.info("notification sent", { event: input.event, recipients: recipients.length, sent, failed });
    }
    return { recipients: recipients.length, sent, failed };
  } catch (err) {
    logger.error("notification failed", { event: input.event, error: err instanceof Error ? err.message : String(err) });
    return { recipients: 0, sent: 0, failed: 0, skipped: "error" };
  }
}

// From a route handler: sends once the response has gone out, so emails
// never slow a save down (Next's after(); on Vercel the function stays up
// until it finishes). Outside a request it just runs in the background.
export function notifyAfterResponse(input: NotifyInput): void {
  try {
    after(() => notify(input).then(() => undefined));
  } catch {
    void notify(input);
  }
}
