// Only same-site relative paths are accepted as a post-login destination —
// "//evil.com" and "/\evil.com" are protocol-relative to browsers and would
// turn ?callbackUrl= into an open redirect. Shared by middleware and the
// login page so both apply exactly the same rule.
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return null;
  return raw;
}
