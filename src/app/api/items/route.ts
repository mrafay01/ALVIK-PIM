import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import "@/models/Vendor"; // registers the Vendor schema so .populate("vendorId") resolves

// GET: list items (most recently updated first). Supports ?status=... filter.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { vendorId, vendorSku, category, costPerUnit, msrp, notes } = body;

  if (!vendorId || !vendorSku) {
    return NextResponse.json({ error: "vendorId and vendorSku are required" }, { status: 400 });
  }

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
