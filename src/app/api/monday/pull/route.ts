import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import SyncLog from "@/models/SyncLog";
import { previewPullSlice, commitSelectedPullRows } from "@/lib/monday/pull";
import { PULL_IMPORT_CHUNK } from "@/lib/monday/pullLimits";
import { MondayApiError } from "@/lib/monday/client";
import logger from "@/lib/logger";

// Monday unreachable or refusing the request: a clear message, not a bare 500.
function mondayFailed(what: string, err: unknown) {
  logger.error(`Monday ${what} failed`, { error: err instanceof Error ? err.message : String(err) });
  const detail = err instanceof MondayApiError ? ` Monday said: ${err.message.slice(0, 200)}` : "";
  return NextResponse.json(
    { error: `Couldn't ${what === "preview" ? "read the Monday board" : "finish the import"}. Try again in a moment.${detail}` },
    { status: 502 }
  );
}

// Each call does a bounded slice of work (see lib/monday/pull.ts): the
// whole board takes ~2 minutes to read, far past the serverless limit, so
// the screen pages through it with repeated calls.
export const maxDuration = 60;

// GET: dry-run preview only, one slice at a time. Without `cursor` it reads
// the first pages of the live board; with the `cursor` a previous call
// returned, the next ones. Reports what a pull would create/update/skip for
// those items. Never writes to the DB or to Monday.
export async function GET(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const cursor = req.nextUrl.searchParams.get("cursor") || null;
  if (cursor && cursor.length > 2000) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  await connectDB();
  try {
    return NextResponse.json(await previewPullSlice(cursor));
  } catch (err) {
    return mondayFailed("preview", err);
  }
}

// POST: applies the rows the caller reviewed via GET, by board item id
// (up to PULL_IMPORT_CHUNK per call). Those items are re-read from Monday
// so what's written is the board's current data.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  // Only the ids of the rows the reviewer kept selected; the rows
  // themselves are rebuilt from the board server-side. (Sending whole rows
  // for a full ~7,000-item board ran past the 1 MB JSON request limit.)
  const body = (await req.json().catch(() => null)) as { mondayItemIds?: unknown } | null;
  const ids = body?.mondayItemIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && /^\d+$/.test(id))) {
    return NextResponse.json({ error: "Select at least one board item to import" }, { status: 400 });
  }
  // The screen sends the selection in chunks; one chunk per request keeps
  // the Monday reads + writes inside the time limit.
  if (ids.length > PULL_IMPORT_CHUNK) {
    return NextResponse.json({ error: `Send at most ${PULL_IMPORT_CHUNK} board items per request` }, { status: 413 });
  }

  await connectDB();

  const startedAt = new Date();
  let result;
  try {
    result = await commitSelectedPullRows(ids as string[]);
  } catch (err) {
    // Recorded like any other run, so a failed import is traceable too.
    await SyncLog.create({
      runType: "monday_pull",
      startedAt,
      finishedAt: new Date(),
      rowsProcessed: ids.length,
      errored: ids.length,
      errorDetail: [{ message: err instanceof Error ? err.message.slice(0, 500) : String(err) }],
    }).catch(() => undefined);
    return mondayFailed("import", err);
  }

  await SyncLog.create({
    runType: "monday_pull",
    startedAt,
    finishedAt: new Date(),
    rowsProcessed: result.processed,
    changed: result.updated + result.created,
    unchanged: 0,
    skipped: result.skipped,
    errored: result.errored,
    errorDetail: result.errors.map((e) => ({ message: `Monday item ${e.mondayItemId}: ${e.message}` })),
  });

  return NextResponse.json(result);
}
