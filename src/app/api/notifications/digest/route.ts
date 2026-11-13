import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { ROLES } from "@/lib/enums";
import { notify } from "@/lib/notifications/notify";
import { digestEmail, isoWeekKey, loadDigestCounts } from "@/lib/notifications/digest";
import logger from "@/lib/logger";

// GET: send this week's summary email to everyone who turned it on.
// Called by the Vercel Cron in vercel.json every Monday morning (Vercel
// sends "Authorization: Bearer $CRON_SECRET"); any other scheduler can call
// it with JOBS_WORKER_TOKEN instead. Not role-gated (no user session), and
// not in middleware's matcher: the shared secret is the gate. Goes out at
// most once per ISO week, so a retried or doubled cron call can't send two.
export const maxDuration = 60;

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secrets = [process.env.CRON_SECRET, process.env.JOBS_WORKER_TOKEN].filter((s): s is string => !!s);
  return secrets.some((s) => constantTimeEquals(provided, s));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const week = isoWeekKey(new Date());
  const once = await rateLimit(`digest:${week}`, { limit: 1, windowMs: 8 * 24 * 60 * 60 * 1000 });
  if (!once.allowed) return NextResponse.json({ week, skipped: "already sent this week" });

  const counts = await loadDigestCounts();
  const results: Record<string, { recipients: number; sent: number; failed: number }> = {};
  for (const role of ROLES) {
    const r = await notify({ event: "weeklyDigest", email: digestEmail(role, counts), onlyRoles: [role] });
    results[role] = { recipients: r.recipients, sent: r.sent, failed: r.failed };
  }
  logger.info("weekly digest sent", { week, results });
  return NextResponse.json({ week, results });
}
