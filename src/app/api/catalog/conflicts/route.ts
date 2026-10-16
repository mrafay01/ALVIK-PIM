import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import CatalogConflict from "@/models/CatalogConflict";
import { jsonWithCache } from "@/lib/httpCache";

const CONFLICT_ROLES = ["marketplace_listing"] as const;

// GET /api/catalog/conflicts
//   ?itemId=... (optional) — scope to one item
//   ?status=pending (optional) — defaults to pending
//
// Admin + marketplace_listing (same role that approves catalog
// submissions). Returns the raw conflict documents with the item it
// targets populated for the review UI.
export async function GET(req: NextRequest) {
  const gate = await requireRole([...CONFLICT_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId");
  const status = url.searchParams.get("status") ?? "pending";

  const query: Record<string, unknown> = { status };
  if (itemId && /^[0-9a-fA-F]{24}$/.test(itemId)) query.itemId = itemId;

  await connectDB();
  const conflicts = await CatalogConflict.find(query)
    .populate("itemId", "itemNumber title baseSku")
    .populate("quotationId", "sourceFileName poNumber")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return jsonWithCache(req, { conflicts });
}
