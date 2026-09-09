import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { ItemCreateSchema, badRequest } from "@/lib/schemas";
import { ITEM_STATUSES } from "@/lib/enums";
import Item from "@/models/Item";

// GET: list items (most recently updated first). Supports ?status=... filter.
export async function GET(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const statusParam = req.nextUrl.searchParams.get("status");
  // Validate against the enum so a `?status[$ne]=` style value can't reach
  // the query as an operator object.
  const status =
    statusParam && (ITEM_STATUSES as readonly string[]).includes(statusParam)
      ? statusParam
      : undefined;
  const query = status ? { status } : {};
  const items = await Item.find(query)
    .select("status sampleSku itemNumber vendorId vendorSku category updatedAt")
    .populate("vendorId", "name")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ items });
}

// POST: intake a new quoted item — the start of the pilot lifecycle.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.items);
  if (isAuthFail(gate)) return gate.response;

  const parsed = ItemCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { vendorId, vendorSku, category, costPerUnit, msrp, notes } = parsed.data;

  await connectDB();
  const item = await Item.create({
    status: "quoted",
    vendorId,
    vendorSku,
    category: category || undefined,
    pricingHistory:
      costPerUnit || msrp
        ? [{ costPerUnit: costPerUnit || undefined, msrp: msrp || undefined, source: "manual_intake" }]
        : [],
    reviewDecision: notes ? { note: notes } : undefined,
  });

  return NextResponse.json({ item }, { status: 201 });
}
