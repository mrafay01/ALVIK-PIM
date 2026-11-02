// Only same-site relative paths are accepted as a post-login destination.
// The path is resolved the way a browser would resolve it and must stay on
// this site: "//evil.com", "/\evil.com", and variants hidden with tabs or
// newlines (which browsers strip, turning "/\t/evil.com" into "//evil.com")
// all resolve elsewhere and are refused. Shared by middleware and the login
// page so both apply exactly the same rule.
const PROBE_ORIGIN = "http://callback.invalid";

export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("/login") || path.startsWith("/api/")) return null;
  return path;
}
