// Best-effort client IP for rate-limit keys.
//
// Forwarding headers are written by whoever sent the request unless a
// trusted proxy overwrites them, so they are only believed when the app
// runs behind one: on Vercel (VERCEL=1, which sets x-vercel-forwarded-for
// itself) or when TRUST_PROXY_HEADERS=true is set for another reverse proxy.
// Anywhere else every caller shares the "unknown" bucket rather than being
// able to pick its own address and dodge a per-IP limit.
type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

function read(h: HeaderSource, name: string): string | undefined {
  if (!h) return undefined;
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] : v;
}

function proxyIsTrusted(): boolean {
  return process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "true";
}

export function clientIp(headers: HeaderSource): string {
  if (!proxyIsTrusted()) return "unknown";
  const first = (v: string | undefined) => v?.split(",")[0]?.trim() || undefined;
  // A generic proxy appends the address it saw to the END of
  // x-forwarded-for; anything before that came from the client.
  const last = (v: string | undefined) => v?.split(",").pop()?.trim() || undefined;
  return (
    first(read(headers, "x-vercel-forwarded-for")) ||
    first(read(headers, "x-real-ip")) ||
    last(read(headers, "x-forwarded-for")) ||
    "unknown"
  );
}
