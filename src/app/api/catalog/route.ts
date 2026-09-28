import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { CatalogItemCreateSchema, badRequest } from "@/lib/schemas";
import Item from "@/models/Item";
import { splitSku } from "@/lib/catalog/sku";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { validateItemMeasurements, formatValidationIssues } from "@/lib/measurements/validate";
import type { ItemMeasurements } from "@/lib/measurements/types";

const CATALOG_ROLES = ["marketplace_listing"] as const;

// Master File-derived spec fields that can vary per variation row, falling
// back to the shared/base value when a variation doesn't override it. Keys
// match CatalogVariationSchema; values are the dot-path under `specs`.
// Structured measurements (length/width/ring size/etc.) are handled
// separately via `measurements` below, not through this map — see
// src/lib/measurements/.
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
  clasp: "specs.clasp",
};

// POST: hand-enter a finalized catalog product (base SKU + optional
// variations). These skip the pilot pipeline entirely — someone with
// catalog rights is adding a known, verified item — so they go straight in
// as `inCatalog`, approved, status "live". Field set mirrors the real
// Master File columns (see parseMasterFile.ts) so a manually-entered item
// carries the same information an imported one would.
//
// Variation rules (see the Variations screen for the UI side of this):
//   - category / brand / gender / metal / MSRP are ALWAYS the base item's
//     value — never per-variation. Every variation row shares one
//     pricingHistory entry with the base (same msrp/ruePrice/date).
//   - title / description MAY differ per variation; falls back to the
//     base item's when a variation doesn't set its own.
//   - SKU is normally "{baseSku}-{suffix}" (derived), but a variation can
//     set `independentSku` to use a wholly different SKU instead — it
//     still belongs to the same family via variationGroupId.
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
      { error: "The main SKU shouldn't contain a hyphen. Add variations separately" },
      { status: 400 }
    );
  }

  if (d.measurements) {
    const result = validateItemMeasurements(d.measurements, d.category);
    if (!result.valid) {
      return NextResponse.json(
        { error: formatValidationIssues(result.issues), details: result.issues },
        { status: 400 }
      );
    }
  }

  for (const v of d.variations ?? []) {
    if (v.independentSku) {
      const split = splitSku(v.independentSku);
      if (split.variantSuffix) {
        return NextResponse.json(
          { error: `Variation "${v.suffix}": independent SKU "${v.independentSku}" shouldn't contain a hyphen.` },
          { status: 400 }
        );
      }
    }
    // Measurements CAN differ per variation (e.g. a size or plating
    // variant needs its own ring_size/dimensions) — validated against the
    // same shared category every row uses, since category itself never
    // varies per variation.
    if (v.measurements) {
      const result = validateItemMeasurements(v.measurements, d.category);
      if (!result.valid) {
        return NextResponse.json(
          {
            error: `Variation "${v.suffix}": ${formatValidationIssues(result.issues)}`,
            details: result.issues,
          },
          { status: 400 }
        );
      }
    }
  }

  type Row = {
    itemNumber: string;
    title: string;
    description?: string;
    plating?: string;
    upc?: string;
    upc2?: string;
    aliasSku?: string;
    totalWeight?: number;
    silverWeight?: number;
    // Falls back to the base item's `measurements` (d.measurements) when a
    // variation doesn't set its own — same inheritance pattern as
    // plating/weight above, just a richer object.
    measurements?: ItemMeasurements;
    specOverrides: Record<string, string | undefined>;
  };
  const baseRow: Row = {
    itemNumber: d.sku,
    title: d.title,
    description: d.description,
    plating: d.plating,
    upc: d.upc,
    upc2: d.upc2,
    aliasSku: d.aliasSku,
    totalWeight: d.totalWeight,
    silverWeight: d.silverWeight,
    measurements: d.measurements,
    specOverrides: Object.fromEntries(
      Object.keys(VARIANT_SPEC_FIELDS).map((k) => [k, d[k as keyof typeof d] as string | undefined])
    ),
  };
  const rows: Row[] = [
    baseRow,
    ...(d.variations ?? []).map((v) => ({
      itemNumber: v.independentSku ? splitSku(v.independentSku).baseSku : `${base.baseSku}-${v.suffix}`,
      title: v.title ?? d.title,
      description: v.description ?? d.description,
      plating: v.plating ?? d.plating,
      upc: v.upc,
      upc2: v.upc2,
      aliasSku: v.aliasSku,
      totalWeight: v.totalWeight ?? d.totalWeight,
      silverWeight: v.silverWeight ?? d.silverWeight,
      measurements: v.measurements ?? d.measurements,
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

  // Per-marketplace description overrides — same shape/semantics as the
  // PATCH /api/items/[itemId] marketplaceDescription write (see route.ts
  // there), just applied to every field present at creation time instead
  // of one platform per call. Not per-variant: marketing copy for a
  // marketplace doesn't change because the plating/size does.
  const marketplaceDescriptions = d.marketplaceDescriptions
    ? Object.fromEntries(
        Object.entries(d.marketplaceDescriptions)
          .filter(([, text]) => text.trim().length > 0)
          .map(([platform, text]) => [
            platform,
            { text, source: "manual", updatedBy: userId, updatedAt: now },
          ])
      )
    : undefined;

  // One shared family id across the base row and every variation — see
  // Item.ts's variationGroupId field comment. Assigned even for a
  // single-item (no-variations) submission so a variation added to it
  // later (via a future "add variation to this item" action) has
  // something to join.
  const variationGroupId = new Types.ObjectId();

  // One shared pricing entry for the whole family — MSRP/Rue price/date
  // are never per-variation (see the function comment above).
  const pricingHistory: Record<string, unknown>[] =
    d.msrp != null || d.newMsrp != null || d.ruePrice != null
      ? [
          {
            msrp: d.newMsrp ?? d.msrp,
            ruePrice: d.ruePrice,
            effectiveDate: d.effectiveDate ? new Date(d.effectiveDate) : now,
            source: "manual_catalog",
          },
        ]
      : [];

  const docs = rows.map((r) => {
    const { baseSku, variantSuffix } = splitSku(r.itemNumber);

    const specs: Record<string, unknown> = {
      metal: d.metal,
      plating: r.plating,
      weight: { totalG: r.totalWeight, silverG: r.silverWeight },
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

    const doc: Record<string, unknown> = {
      itemNumber: r.itemNumber,
      baseSku,
      variantSuffix,
      variationGroupId,
      origin: "manual",
      status: "live",
      inCatalog: true,
      catalogApproval: { status: "approved", approvedBy: userId, approvedAt: now },
      title: r.title,
      title2: d.title2,
      description: r.description,
      description2: d.description2,
      category: d.category,
      brand: d.brand,
      bulletFeatures: d.bulletFeatures,
      specs,
      upc: r.upc,
      upc2: r.upc2,
      aliasSku: r.aliasSku,
      pricingHistory,
      lastEditedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    if (marketplaceDescriptions && Object.keys(marketplaceDescriptions).length > 0) {
      doc.marketplaceDescriptions = marketplaceDescriptions;
    }
    if (r.measurements) {
      doc.measurements = { ...r.measurements, category: d.category };
    }
    doc.masterRecordComplete = isMasterRecordComplete(
      doc as unknown as Parameters<typeof isMasterRecordComplete>[0]
    );
    return doc;
  });

  const inserted = await Item.insertMany(docs);
  return NextResponse.json({ baseItemId: inserted[0]._id, created: inserted.length }, { status: 201 });
}
