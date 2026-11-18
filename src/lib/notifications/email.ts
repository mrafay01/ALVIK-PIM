// Builds notification emails: one layout for every kind, in the same style
// as the sign-in code email (lib/mailer.ts). Tables and inline styles only,
// the one markup that renders the same in Outlook, Gmail and Apple Mail.
// Pure functions, so they're unit-tested without sending anything.

export type EmailRow = { label: string; value: string };
export type EmailListItem = { text: string; href?: string };

export type NotificationEmail = {
  subject: string;
  // Small caps line above the heading, e.g. "Purchase order".
  eyebrow: string;
  heading: string;
  intro: string;
  rows?: EmailRow[];
  // A short list (SKUs, PO numbers, …). Longer lists are cut with "and N more".
  list?: EmailListItem[];
  listTotal?: number;
  action?: { label: string; href: string };
  // Why the reader gets this, shown in the footer.
  reason: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const LIST_LIMIT = 15;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Header-safe: an email subject can't carry line breaks.
export function cleanSubject(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

// The app's public address, for links in emails. Never ends with "/".
export function appUrl(path = "/"): string {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Only http(s) links make it into an email.
function safeHref(href: string): string | null {
  return /^https?:\/\//i.test(href) ? href : null;
}

export function renderNotificationEmail(e: NotificationEmail): RenderedEmail {
  const subject = cleanSubject(`${e.subject} · Alvik PIM`);
  const shown = (e.list ?? []).slice(0, LIST_LIMIT);
  const total = Math.max(e.listTotal ?? 0, e.list?.length ?? 0);
  const more = total - shown.length;
  const settings = appUrl("/settings/notifications");

  // ---- plain text
  const text = [
    e.heading,
    "",
    e.intro,
    ...(e.rows?.length ? ["", ...e.rows.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(shown.length ? ["", ...shown.map((i) => `- ${i.text}${i.href ? ` (${i.href})` : ""}`)] : []),
    ...(more > 0 ? [`- and ${more} more`] : []),
    ...(e.action ? ["", `${e.action.label}: ${e.action.href}`] : []),
    "",
    "--",
    e.reason,
    `Change which emails you get: ${settings}`,
  ].join("\n");

  // ---- html
  const rowsHtml = e.rows?.length
    ? `<tr><td style="padding:22px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dcdcd8;border-radius:10px;">
${e.rows
  .map(
    (r, i) => `<tr>
<td style="padding:10px 14px;font-size:13px;color:#62656e;width:38%;vertical-align:top;${i > 0 ? "border-top:1px solid #ececea;" : ""}">${escapeHtml(r.label)}</td>
<td style="padding:10px 14px;font-size:13.5px;color:#16171b;font-weight:600;vertical-align:top;${i > 0 ? "border-top:1px solid #ececea;" : ""}">${escapeHtml(r.value)}</td>
</tr>`
  )
  .join("\n")}
</table>
</td></tr>`
    : "";

  const listHtml = shown.length
    ? `<tr><td style="padding:18px 40px 0 40px;">
<ul style="margin:0;padding:0 0 0 18px;font-size:13.5px;line-height:1.7;color:#16171b;">
${shown
  .map((i) => {
    const href = i.href ? safeHref(i.href) : null;
    const body = escapeHtml(i.text);
    return `<li>${href ? `<a href="${escapeHtml(href)}" style="color:#4c7a12;text-decoration:none;">${body}</a>` : body}</li>`;
  })
  .join("\n")}
${more > 0 ? `<li style="color:#62656e;">and ${more} more</li>` : ""}
</ul>
</td></tr>`
    : "";

  const actionHref = e.action ? safeHref(e.action.href) : null;
  const actionHtml =
    e.action && actionHref
      ? `<tr><td style="padding:26px 40px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background-color:#8dca37;border-radius:999px;">
<a href="${escapeHtml(actionHref)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:700;color:#17202b;text-decoration:none;">${escapeHtml(e.action.label)}</a>
</td></tr></table>
</td></tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(e.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f3f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3f2;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(22,23,27,0.06),0 8px 28px rgba(22,23,27,0.07);">
<tr><td style="height:5px;line-height:5px;font-size:0;background-color:#8dca37;background-image:linear-gradient(90deg,#6fa821 0%,#a6dc5a 50%,#6fa821 100%);">&nbsp;</td></tr>
<tr><td style="padding:32px 40px 0 40px;font-family:Urbanist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#16171b;letter-spacing:0.3px;">Alvik <span style="color:#4c7a12;">PIM</span></td></tr>
<tr><td style="padding:24px 40px 0 40px;">
<p style="margin:0;font-size:12.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#4c7a12;">${escapeHtml(e.eyebrow)}</p>
<h1 style="margin:8px 0 0 0;font-family:Urbanist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.35;font-weight:700;color:#16171b;">${escapeHtml(e.heading)}</h1>
<p style="margin:12px 0 0 0;font-size:14.5px;line-height:1.6;color:#3f424a;">${escapeHtml(e.intro)}</p>
</td></tr>
${rowsHtml}
${listHtml}
${actionHtml}
<tr><td style="padding:32px 40px 30px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #dcdcd8;">
<tr><td style="padding-top:18px;font-size:12px;line-height:1.6;color:#62656e;">
${escapeHtml(e.reason)}<br>
<a href="${escapeHtml(settings)}" style="color:#62656e;text-decoration:underline;">Change which emails you get</a> &middot; Alvik PIM
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
