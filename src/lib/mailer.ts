import nodemailer from "nodemailer";

// SMTP transport for outbound app email (currently: login OTP codes).
// Configured entirely via env vars — see .env.local's SMTP_* block. Built
// lazily so importing this module never requires SMTP_* to be set (e.g.
// during typecheck/build); it only throws if something actually tries to
// send mail without configuration present.
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (transport) return transport;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must all be set to send email.");
  }

  transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transport;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to,
    subject: `${code} is your CZC PIM verification code`,
    text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email — nobody can sign in without it.`,
    html: otpEmailHtml(code),
  });
}

// Table-based layout with every style inlined — the only markup that
// renders consistently across Outlook/Gmail/Apple Mail, none of which
// reliably support external stylesheets, flexbox/grid, or CSS custom
// properties. Colors are the app's own light-theme tokens (globals.css
// :root[data-theme="light"]) — email is read on the recipient's own
// light-mode inbox chrome regardless of which theme the app itself runs
// in, so this deliberately does not follow the app's dark-first default.
function otpEmailHtml(code: string): string {
  const digits = code.split("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Your verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f4f0;">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(18,21,28,0.06),0 8px 28px rgba(18,21,28,0.07);">

<tr>
<td style="height:5px;line-height:5px;font-size:0;background-color:#a97c42;background-image:linear-gradient(90deg,#a97c42 0%,#c9a06a 50%,#a97c42 100%);">&nbsp;</td>
</tr>

<tr>
<td style="padding:36px 40px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#12151c;letter-spacing:0.3px;">
CZC <span style="color:#a97c42;">PIM</span>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:28px 40px 0 40px;">
<p style="margin:0;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#a97c42;">Sign-in verification</p>
<h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.35;font-weight:700;color:#12151c;">Enter this code to continue</h1>
<p style="margin:12px 0 0 0;font-size:14.5px;line-height:1.6;color:#4a5266;">
Someone is signing in to your CZC PIM account. Use the code below to finish verifying it's you — it's only valid for the next 10 minutes.
</p>
</td>
</tr>

<tr>
<td style="padding:28px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf7f2;border:1px solid #eee0c9;border-radius:10px;">
<tr>
<td align="center" style="padding:22px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
${digits
  .map(
    (d) => `<td style="width:40px;height:52px;font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:30px;font-weight:700;color:#12151c;text-align:center;vertical-align:middle;background-color:#ffffff;border:1px solid #e4e1d8;border-radius:8px;">${d}</td><td style="width:6px;line-height:1;font-size:0;">&nbsp;</td>`
  )
  .join("")}
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:20px 40px 0 40px;">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8b93a4;">
Didn't request this? You can safely ignore this email — nobody can sign in without the code above, and it expires on its own in 10 minutes.
</p>
</td>
</tr>

<tr>
<td style="padding:32px 40px 32px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e4e1d8;">
<tr>
<td style="padding-top:20px;font-size:12px;color:#8b93a4;">
CZC PIM &middot; Product &amp; purchase order management
</td>
</tr>
</table>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}
