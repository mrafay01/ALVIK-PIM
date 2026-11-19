// Email addresses are personal data; logs get a masked form that still lets
// an operator tell accounts apart ("a***@example.com").
export function maskEmail(raw: string | null | undefined): string {
  const email = (raw ?? "").trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return email ? "***" : "";
  return `${email[0]}***${email.slice(at)}`;
}
