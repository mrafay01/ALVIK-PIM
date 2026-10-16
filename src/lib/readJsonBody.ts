import { NextResponse } from "next/server";

// Hard cap on JSON request bodies — Next.js's route handlers inherit no
// body-size limit from `next.config` for App Router endpoints, so a
// malicious or runaway client can POST a gigabyte of JSON and spend
// server memory parsing it before the handler ever runs. Every mutating
// JSON endpoint should read bodies through this helper rather than
// `req.json()` directly.
//
// Default cap: 1 MB — larger than any legitimate catalog/PO payload the
// app sends today (the heaviest row-set is quote commit, which goes
// through a separate multipart upload path). Routes that genuinely need
// more can override `maxBytes`.
const DEFAULT_MAX_BYTES = 1_000_000;

export type ReadJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<ReadJsonResult<T>> {
  const header = req.headers.get("content-length");
  if (header) {
    const declared = Number(header);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Request body too large (limit ${Math.floor(maxBytes / 1024)} KB)` },
          { status: 413 }
        ),
      };
    }
  }

  // No streaming-with-byte-cap API on the Edge/Node request yet, so we
  // read as text with a hard cap enforced after the fact. The explicit
  // content-length check above means a well-behaved client never gets
  // here with an oversized body; this is the belt for a missing or
  // forged content-length.
  const text = await req.text();
  if (text.length > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Request body too large (limit ${Math.floor(maxBytes / 1024)} KB)` },
        { status: 413 }
      ),
    };
  }

  try {
    const data = text.length === 0 ? null : (JSON.parse(text) as T);
    return { ok: true, data: data as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}
