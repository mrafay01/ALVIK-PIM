import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { archiveMondayFiles, countPendingMondayFiles } from "@/lib/purchase-orders/files";
import logger from "@/lib/logger";

// Copying Monday PO files into SharePoint, driven from the Monday Import
// screen: each POST copies files for up to ~40 seconds and reports what's
// left, and the screen keeps calling until nothing remains. Short calls
// keep every request inside serverless time limits, and the work resumes
// where it stopped if the page is closed.
export const maxDuration = 60;

// GET: how many PO files are still waiting to be copied.
export async function GET() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  await connectDB();
  return NextResponse.json({ remaining: await countPendingMondayFiles() });
}

// POST: copy the next batch.
export async function POST() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  await connectDB();
  try {
    return NextResponse.json(await archiveMondayFiles({ timeBudgetMs: 40_000 }));
  } catch (err) {
    logger.error("PO file copy batch failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Couldn't reach SharePoint. Try again in a moment." }, { status: 502 });
  }
}
