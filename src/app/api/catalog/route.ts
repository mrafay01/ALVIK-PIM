import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { CatalogItemCreateSchema, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { splitSku } from "@/lib/catalog/sku";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

const CATALOG_ROLES = ["marketplace_listing"] as const;

// POST: hand-enter a finalized catalog product (base SKU + optional
// variations). These skip the pilot pipeline entirely — someone with
// catalog rights is adding a known, verified item — so they go straight in
// as `inCatalog`, approved, status "live".
export async function POST(req: NextRequest) {
  const gate = await requireRole([...CATALOG_ROLES]);
  if (isAuthFail(gate)) return gate.response;
  const userId = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;

  const parsed = CatalogItemCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const d = parsed.data;

  const base = splitSku(d.sku);
  if (base.variantSuffix) {
    return NextResponse.json(
      { error: "The main SKU shouldn't contain a hyphen — add variations separately" },
      { status: 400 }
    );
  }

  // Row plan: the base row, then one per variation.
  type Row = {
    itemNumber: string;
    plating?: string;
    upc?: string;
    msrp?: number;
  };
  const rows: Row[] = [
    { itemNumber: d.sku, plating: d.plating, upc: d.upc, msrp: d.msrp },
    ...(d.variations ?? []).map((v) => ({
      itemNumber: `${base.baseSku}-${v.suffix}`,
      plating: v.plating ?? d.plating,
      upc: v.upc,
      msrp: v.msrp ?? d.msrp,
    })),
  ];

  // Reject if any resulting SKU is a duplicate — within this request or
  // already in the DB.
  const numbers = rows.map((r) => r.itemNumber);
  const dupeInRequest = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (dupeInRequest) {
    return NextResponse.json({ error: `Duplicate SKU in this request: ${dupeInRequest}` }, { status: 400 });
  }
  await connectDB();
  const clash = await Item.findOne({ itemNumber: { $in: numbers } }).select("itemNumber").lean();
  if (clash) {
    return NextResponse.json({ error: `SKU already exists: ${clash.itemNumber}` }, { status: 409 });
  }

  const now = new Date();
  const docs = rows.map((r) => {
    const { baseSku, variantSuffix } = splitSku(r.itemNumber);
    const doc: Record<string, unknown> = {
      itemNumber: r.itemNumber,
      baseSku,
      variantSuffix,
      origin: "manual",
      status: "live",
      inCatalog: true,
      catalogApproval: { status: "approved", approvedBy: userId, approvedAt: now },
      title: d.title,
      description: d.description,
      category: d.category,
      brand: d.brand,
      bulletFeatures: d.bulletFeatures,
      specs: { metal: d.metal, plating: r.plating },
      upc: r.upc,
      pricingHistory: r.msrp != null ? [{ msrp: r.msrp, source: "manual_catalog", effectiveDate: now }] : [],
      createdAt: now,
      updatedAt: now,
    };
    doc.masterRecordComplete = isMasterRecordComplete(
      doc as unknown as Parameters<typeof isMasterRecordComplete>[0]
    );
    return doc;
  });

  const inserted = await Item.insertMany(docs);
  return NextResponse.json({ baseItemId: inserted[0]._id, created: inserted.length }, { status: 201 });
}
