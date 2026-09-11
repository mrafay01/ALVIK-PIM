import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { CatalogItemCreateSchema, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { splitSku } from "@/lib/catalog/sku";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

const CATALOG_ROLES = ["marketplace_listing"] as const;

// Master File-derived spec fields that can vary per variation row, falling
// back to the shared/base value when a variation doesn't override it. Keys
// match CatalogVariationSchema; values are the dot-path under `specs`.
const VARIANT_SPEC_FIELDS: Record<string, string> = {
  mainStoneInfo: "specs.mainStoneInfo",
  mainStoneColor: "specs.mainStoneColor",
  mainStoneType: "specs.mainStoneType",
  restStoneInfo: "specs.restStoneInfo",
  restStoneColor: "specs.restStoneColor",
  restStoneType: "specs.restStoneType",
  stoneSetting: "specs.stoneSetting",
  pearlSize: "specs.pearlSize",
  pearlType: "specs.pearlType",
  lengthExtender: "specs.lengthExtender",
  measurements: "specs.measurements",
  clasp: "specs.clasp",
  postLength: "specs.postLength",
  pushBackSize: "specs.pushBackSize",
  thickness: "specs.thickness",
};

// POST: hand-enter a finalized catalog product (base SKU + optional
// variations). These skip the pilot pipeline entirely — someone with
// catalog rights is adding a known, verified item — so they go straight in
// as `inCatalog`, approved, status "live". Field set mirrors the real
// Master File columns (see parseMasterFile.ts) so a manually-entered item
// carries the same information an imported one would.
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

  type Row = {
    itemNumber: string;
    plating?: string;
    upc?: string;
    msrp?: number;
    totalWeight?: number;
    silverWeight?: number;
    specOverrides: Record<string, string | undefined>;
  };
  const baseRow: Row = {
    itemNumber: d.sku,
    plating: d.plating,
    upc: d.upc,
    msrp: d.msrp,
    totalWeight: d.totalWeight,
    silverWeight: d.silverWeight,
    specOverrides: Object.fromEntries(
      Object.keys(VARIANT_SPEC_FIELDS).map((k) => [k, d[k as keyof typeof d] as string | undefined])
    ),
  };
  const rows: Row[] = [
    baseRow,
    ...(d.variations ?? []).map((v) => ({
      itemNumber: `${base.baseSku}-${v.suffix}`,
      plating: v.plating ?? d.plating,
      upc: v.upc,
      msrp: v.msrp ?? d.msrp,
      totalWeight: v.totalWeight ?? d.totalWeight,
      silverWeight: v.silverWeight ?? d.silverWeight,
      specOverrides: Object.fromEntries(
        Object.keys(VARIANT_SPEC_FIELDS).map((k) => [
          k,
          (v[k as keyof typeof v] as string | undefined) ?? (d[k as keyof typeof d] as string | undefined),
        ])
      ),
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

    const specs: Record<string, unknown> = {
      metal: d.metal,
      plating: r.plating,
      weight: { totalG: r.totalWeight, silverG: r.silverWeight },
      variationSku: d.variationSku,
      variationTitle: d.variationTitle,
      variationDescription: d.variationDescription,
      gender: d.gender,
      tcw: d.tcw,
      totalCaratWeight: d.totalCaratWeight,
      allSpecs: d.allSpecs,
    };
    for (const [key, path] of Object.entries(VARIANT_SPEC_FIELDS)) {
      const value = r.specOverrides[key];
      if (value !== undefined) {
        const leaf = path.split(".").slice(1).join(".");
        specs[leaf] = value;
      }
    }

    const pricingHistory: Record<string, unknown>[] = [];
    if (r.msrp != null || d.newMsrp != null || d.ruePrice != null) {
      pricingHistory.push({
        msrp: d.newMsrp ?? r.msrp,
        ruePrice: d.ruePrice,
        effectiveDate: d.effectiveDate ? new Date(d.effectiveDate) : now,
        source: "manual_catalog",
      });
    }

    const doc: Record<string, unknown> = {
      itemNumber: r.itemNumber,
      baseSku,
      variantSuffix,
      origin: "manual",
      status: "live",
      inCatalog: true,
      catalogApproval: { status: "approved", approvedBy: userId, approvedAt: now },
      title: d.title,
      title2: d.title2,
      description: d.description,
      description2: d.description2,
      category: d.category,
      brand: d.brand,
      bulletFeatures: d.bulletFeatures,
      specs,
      upc: r.upc,
      pricingHistory,
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
