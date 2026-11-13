import { after } from "next/server";
import logger from "@/lib/logger";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import { ROLE_LABEL } from "@/lib/statusDisplay";
import type { Role } from "@/lib/enums";
import { appUrl, renderNotificationEmail, type NotificationEmail } from "./email";

// Account security emails. Unlike the other notifications these can't be
// turned off: they tell a person that something changed on their own
// account, which is how they'd notice it if it wasn't them.

export type SecurityNotice =
  | { kind: "password_changed" }
  | { kind: "password_reset_by_admin"; adminName?: string | null }
  | { kind: "email_changed"; newEmail: string }
  | { kind: "role_changed"; from: Role; to: Role; adminName?: string | null }
  | { kind: "account_deactivated"; adminName?: string | null }
  | { kind: "account_reactivated"; adminName?: string | null };

const REASON = "This is an account security email. It's always sent and can't be turned off.";
const NOT_YOU = "If this wasn't you or you didn't expect it, contact your administrator straight away.";

export function securityEmail(n: SecurityNotice): Omit<NotificationEmail, "reason"> {
  const signIn = { label: "Sign in to CZC PIM", href: appUrl("/login") };
  switch (n.kind) {
    case "password_changed":
      return {
        subject: "Your password was changed",
        eyebrow: "Account security",
        heading: "Your password was changed",
        intro: `The password for your CZC PIM account was just changed, and your other devices were signed out. ${NOT_YOU}`,
        action: signIn,
      };
    case "password_reset_by_admin":
      return {
        subject: "Your password was reset by an administrator",
        eyebrow: "Account security",
        heading: "Your password was reset",
        intro: `${n.adminName ?? "An administrator"} set a new password for your CZC PIM account and you were signed out everywhere. Ask them for the new password, then change it from Settings. ${NOT_YOU}`,
        action: signIn,
      };
    case "email_changed":
      return {
        subject: "Your sign-in email was changed",
        eyebrow: "Account security",
        heading: "Your sign-in email was changed",
        intro: `Your CZC PIM account now signs in with ${n.newEmail}, and emails from the app go there. This address won't get them any more. ${NOT_YOU}`,
      };
    case "role_changed":
      return {
        subject: `Your role is now ${ROLE_LABEL[n.to] ?? n.to}`,
        eyebrow: "Account",
        heading: "Your role in CZC PIM changed",
        intro: `${n.adminName ?? "An administrator"} changed your role, so what you can see and do in the app has changed. You were signed out; sign in again to continue.`,
        rows: [
          { label: "Was", value: ROLE_LABEL[n.from] ?? n.from },
          { label: "Now", value: ROLE_LABEL[n.to] ?? n.to },
        ],
        action: signIn,
      };
    case "account_deactivated":
      return {
        subject: "Your CZC PIM account was deactivated",
        eyebrow: "Account",
        heading: "Your account was deactivated",
        intro: `${n.adminName ?? "An administrator"} deactivated your CZC PIM account, so you can't sign in any more. If you think this is a mistake, contact your administrator.`,
      };
    case "account_reactivated":
      return {
        subject: "Your CZC PIM account is active again",
        eyebrow: "Account",
        heading: "Your account is active again",
        intro: `${n.adminName ?? "An administrator"} reactivated your CZC PIM account. You can sign in again with your usual password.`,
        action: signIn,
      };
  }
}

export async function sendSecurityNotice(to: string, notice: SecurityNotice): Promise<boolean> {
  if (!isMailConfigured()) {
    logger.warn("security email skipped: email (SMTP) is not configured", { kind: notice.kind });
    return false;
  }
  try {
    await sendEmail({ to, ...renderNotificationEmail({ ...securityEmail(notice), reason: REASON }) });
    logger.info("security email sent", { kind: notice.kind });
    return true;
  } catch (err) {
    logger.error("security email failed", { kind: notice.kind, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// From a route handler: sends after the response (see notifyAfterResponse).
export function sendSecurityNoticeAfterResponse(to: string, notice: SecurityNotice): void {
  try {
    after(() => sendSecurityNotice(to, notice).then(() => undefined));
  } catch {
    void sendSecurityNotice(to, notice);
  }
}
