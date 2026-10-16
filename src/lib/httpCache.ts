import { NextResponse } from "next/server";
import crypto from "crypto";

// Lightweight ETag + Cache-Control helpers for GET route handlers.
// The app's read endpoints return the same JSON for the same input
// between writes — so the browser (and any CDN) can short-circuit with
// a 304 Not Modified when the payload hash hasn't moved. Saves the
// network round-trip and client parse on every revisit of a list page.
//
// Deliberately NO `public, max-age=...` on anything role-gated — a
// shared cache (CDN) would otherwise serve one role's filtered view to
// another. The default here is `private, no-cache` which still permits
// a 304 handshake but requires the browser to revalidate every time.

export type JsonCacheOptions = {
  // Max age in seconds for private (per-user) caching. 0 means "no
  // storage, but revalidate" — the common default.
  maxAge?: number;
};

export function jsonWithCache<T>(
  req: Request,
  body: T,
  options: JsonCacheOptions = {}
): NextResponse {
  const serialized = JSON.stringify(body);
  const etag = `W/"${crypto.createHash("sha1").update(serialized).digest("base64").slice(0, 22)}"`;

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    const res = new NextResponse(null, { status: 304 });
    res.headers.set("ETag", etag);
    res.headers.set("Cache-Control", `private, max-age=${options.maxAge ?? 0}, must-revalidate`);
    return res;
  }

  const res = new NextResponse(serialized, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  res.headers.set("ETag", etag);
  res.headers.set("Cache-Control", `private, max-age=${options.maxAge ?? 0}, must-revalidate`);
  // Make caches key per cookie — different session, different view.
  res.headers.set("Vary", "Cookie, Accept-Encoding");
  return res;
}
