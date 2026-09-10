import { z } from "zod";
import {
  ITEM_STATUSES,
  PO_STATUSES,
  ORDER_PURPOSE_CATEGORIES,
  PRIORITIES,
  PAYMENT_TRANCHES,
  PAYMENT_METHODS,
  IMAGES_CHECKLIST_STATUSES,
  DATA_CHECKLIST_STATUSES,
  PRICING_CHECKLIST_STATUSES,
  JM_UPDATE_STATUSES,
  ON_MASTER_STATUSES,
  DESCRIPTIONS_STATUSES,
} from "@/lib/enums";

// Request-body validation for the API routes. Every mutating handler parses
// its body through one of these before touching Mongoose, so unvalidated /
// mass-assigned fields and illegal enum values can't reach the database.
//
// Helper for handlers:
//   const parsed = ItemCreateSchema.safeParse(await req.json());
//   if (!parsed.success) return badRequest(parsed.error);

import { NextResponse } from "next/server";

export function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    { error: "Invalid request body", details: error.flatten().fieldErrors },
    { status: 400 }
  );
}

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a Mongo ObjectId");
const money = z.number().finite().min(0).max(1e12);
const shortText = z.string().trim().min(1).max(500);

// ---------------------------------------------------------------- items

export const ItemCreateSchema = z.object({
  vendorId: objectId,
  vendorSku: shortText,
  category: z.string().trim().max(200).optional(),
  costPerUnit: money.optional(),
  msrp: money.optional(),
  notes: z.string().trim().max(2000).optional(),
});

// specs is an intentionally open shape (SpecsSchema is strict:false), but
// it must still be a flat-ish object of primitives — not an arbitrary
// nested payload, and capped in size.
const specsValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
export const ItemSpecsSchema = z.record(z.string().max(60), specsValue).refine(
  (o) => Object.keys(o).length <= 40,
  "too many spec fields"
);

// Allowed item lifecycle transitions. Anything not listed is rejected — the
// PATCH route previously assigned body.status verbatim, letting any client
// jump an item straight to "live" or "discontinued".
export const ITEM_TRANSITIONS: Record<string, readonly string[]> = {
  quoted: ["review_pending", "approved", "rejected", "hold"],
  review_pending: ["approved", "rejected", "hold"],
  hold: ["review_pending", "approved", "rejected"],
  approved: ["sample_ordered", "rejected", "hold"],
  rejected: [],
  sample_ordered: ["sample_received", "hold"],
  sample_received: ["photography", "hold"],
  photography: ["final_review", "hold"],
  final_review: ["sku_permanent", "photography", "hold"],
  sku_permanent: ["po_sent", "discontinued"],
  po_sent: ["receiving", "discontinued"],
  receiving: ["live", "discontinued"],
  live: ["discontinued"],
  discontinued: [],
};

export const ItemPatchSchema = z
  .object({
    reviewDecision: z
      .object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(2000).optional(),
      })
      .optional(),
    sampleSku: shortText.optional(),
    status: z.enum(ITEM_STATUSES).optional(),
    itemNumber: shortText.optional(),
    category: z.string().trim().max(200).optional(),
    title: z.string().trim().max(500).optional(),
    description: z.string().trim().max(5000).optional(),
    brand: z.string().trim().max(200).optional(),
    upc: z.string().trim().max(200).optional(),
    bulletFeatures: z.array(z.string().trim().max(500)).max(10).optional(),
    specs: ItemSpecsSchema.optional(),
    pricing: z
      .object({
        costPerUnit: money.optional(),
        msrp: money.optional(),
        ruePrice: money.optional(),
      })
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// --------------------------------------------------------------- catalog

// One hand-entered catalog product: a base SKU plus optional variations
// (same design, hyphen-suffixed SKU — different plating / stone / size).
const catalogText = z.string().trim().min(1).max(200);
const CatalogVariationSchema = z.object({
  suffix: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "letters, digits and hyphens only"),
  plating: z.string().trim().max(300).optional(),
  upc: z.string().trim().max(200).optional(),
  msrp: money.optional(),
});

export const CatalogItemCreateSchema = z.object({
  sku: catalogText,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).optional(),
  metal: z.string().trim().max(200).optional(),
  plating: z.string().trim().max(300).optional(),
  msrp: money.optional(),
  upc: z.string().trim().max(200).optional(),
  bulletFeatures: z.array(z.string().trim().max(500)).max(10).optional(),
  variations: z.array(CatalogVariationSchema).max(20).optional(),
});

// ------------------------------------------------------- purchase orders

export const PoCreateSchema = z.object({
  poNumber: shortText,
  vendorId: objectId,
  orderPurposeCategory: z.enum(ORDER_PURPOSE_CATEGORIES),
  priority: z.enum(PRIORITIES).optional(),
  itemId: objectId,
  qty: z.number().finite().min(0).max(1e9).optional(),
  unitCost: money.optional(),
});

const backOfficeChecklistPatch = z
  .object({
    images: z.enum(IMAGES_CHECKLIST_STATUSES).optional(),
    data: z.enum(DATA_CHECKLIST_STATUSES).optional(),
    pricing: z.enum(PRICING_CHECKLIST_STATUSES).optional(),
    jmUpdate: z.enum(JM_UPDATE_STATUSES).optional(),
    onMaster: z.enum(ON_MASTER_STATUSES).optional(),
    descriptions: z.enum(DESCRIPTIONS_STATUSES).optional(),
  })
  .strict();

export const PoPatchSchema = z
  .object({
    backOfficeChecklist: backOfficeChecklistPatch.optional(),
    status: z.enum(PO_STATUSES).optional(),
    vendorReplySent: z.literal(true).optional(),
    joelShipConfirmed: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// PO pipeline is an ordered progression; only forward-by-one or staying
// put is allowed (side-lane skips at the start are handled by starting the
// PO on the right status, not by jumping mid-pipeline).
export function isValidPoTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const fromIdx = PO_STATUSES.indexOf(from as (typeof PO_STATUSES)[number]);
  const toIdx = PO_STATUSES.indexOf(to as (typeof PO_STATUSES)[number]);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

// ------------------------------------------------------------- payables

export const PaymentCreateSchema = z.object({
  poId: objectId,
  vendorId: objectId,
  tranche: z.enum(PAYMENT_TRANCHES),
  invoiceRef: z.string().trim().max(200).optional(),
  amountDue: money.optional(),
  dueDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  creditAppliedFrom: objectId.optional().nullable(),
});

export const PaymentPatchSchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    proofOfPaymentUrl: z.string().trim().url().max(2000).optional(),
    status: z.enum(["paid", "archived"]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// --------------------------------------------------- import review rows

export const ImportRowPatchSchema = z
  .object({
    reviewStatus: z.enum(["approved", "rejected", "needs_review"]).optional(),
    coercedOverrides: z.record(z.string().max(100), z.unknown()).optional(),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// ------------------------------------------------------------ quotations

// One manually-entered line item: `fields` is an open map of QUOTE_FIELDS
// keys to the raw string the person typed; `custom` is an open map of the
// quote-level custom column labels to their value. Kept as strings here —
// the same coercion the file parser uses runs server-side (stageManualRow)
// so the two intake paths stage identical row shapes.
const quoteItemValue = z.string().trim().max(500);
const quoteStringMap = z
  .record(z.string().max(60), quoteItemValue)
  .refine((o) => Object.keys(o).length <= 60, "too many fields on one item");

const QuoteManualItemSchema = z.object({
  fields: quoteStringMap,
  custom: quoteStringMap.optional(),
});

export const QuotationManualSchema = z.object({
  vendorId: objectId,
  poNumber: z.string().trim().max(200).optional(),
  receivedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  season: z.string().trim().max(120).optional(),
  // Labels of the quote-level custom columns, for reference/echo.
  customColumns: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  items: z.array(QuoteManualItemSchema).min(1, "add at least one item").max(200),
});

export const QuotationRowPatchSchema = z
  .object({
    reviewStatus: z.enum(["approved", "rejected", "needs_review"]).optional(),
    coercedOverrides: z.record(z.string().max(100), z.unknown()).optional(),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// ------------------------------------------------- marketplace listings

export const MarketplaceListingPatchSchema = z
  .object({
    upc: shortText.optional(),
    gtin: shortText.optional(),
    productTitle: z.string().trim().max(500).optional(),
    productDescription: z.string().trim().max(5000).optional(),
    bulletFeatures: z.array(z.string().trim().max(500)).max(10).optional(),
    weightLb: z.number().finite().min(0).max(1000).optional(),
    weightOz: z.number().finite().min(0).max(16000).optional(),
    lengthIn: z.number().finite().min(0).max(1000).optional(),
    widthIn: z.number().finite().min(0).max(1000).optional(),
    heightIn: z.number().finite().min(0).max(1000).optional(),
    price: money.optional(),
    salePrice: money.optional(),
    marketplaceCategory: z.string().trim().max(300).optional(),
    marketplaceSubtype: z.string().trim().max(300).optional(),
    careInstructions: z.string().trim().max(1000).optional(),
    countryOfOrigin: z.string().trim().max(100).optional(),
    chokingHazardWarning: z.string().trim().max(500).optional(),
    prop65Warning: z.string().trim().max(500).optional(),
    readyToExport: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// -------------------------------------------------- shared query params

export const StatusQuerySchema = z.string().trim().min(1).max(60);
