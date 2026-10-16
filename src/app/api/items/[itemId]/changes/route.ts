import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import CatalogChange from "@/models/CatalogChange";
import { jsonWithCache } from "@/lib/httpCache";
import { isObjectId } from "@/lib/ids";

// GET /api/items/[itemId]/changes — the append-only authoritative-
// field change log for this item. Rendered on the item detail page as
// a "Change history" accordion so a reviewer can always see why a
// weight went from 10g to 12g (which PI, who approved, when).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const { itemId } = await params;
  if (!isObjectId(itemId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!/^[0-9a-fA-F]{24}$/.test(itemId)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  await connectDB();
  const changes = await CatalogChange.find({ itemId })
    .populate("sourceRef.quotationId", "sourceFileName poNumber")
    .populate("sourceRef.userId", "name email")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return jsonWithCache(req, { changes });
}
