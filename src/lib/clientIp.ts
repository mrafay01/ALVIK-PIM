// Best-effort client IP for rate-limit keys. Platform-set headers come first
// because a client can put anything it likes in its own X-Forwarded-For;
// Vercel and most reverse proxies overwrite x-vercel-forwarded-for /
// x-real-ip with the address they actually saw.
type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

function read(h: HeaderSource, name: string): string | undefined {
  if (!h) return undefined;
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] : v;
}

export function clientIp(headers: HeaderSource): string {
  const first = (v: string | undefined) => v?.split(",")[0]?.trim() || undefined;
  return (
    first(read(headers, "x-vercel-forwarded-for")) ||
    first(read(headers, "x-real-ip")) ||
    first(read(headers, "x-forwarded-for")) ||
    "unknown"
  );
}
