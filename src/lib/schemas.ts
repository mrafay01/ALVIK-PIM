import { z } from "zod";
import {
  ITEM_STATUSES,
  PO_STATUSES,
  ORDER_PURPOSE_CATEGORIES,
  PRIORITIES,
  IMAGES_CHECKLIST_STATUSES,
  DATA_CHECKLIST_STATUSES,
  PRICING_CHECKLIST_STATUSES,
  JM_UPDATE_STATUSES,
  ON_MASTER_STATUSES,
  DESCRIPTIONS_STATUSES,
  DESCRIPTION_PLATFORMS,
  ROLES,
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

// ---------------------------------------------------------- measurements
//
// Shape validation only (Zod's job) — negative/NaN/Infinity/unit and
// min<=max business-rule checks live in src/lib/measurements/validate.ts
// and run separately at the API route, same division as ITEM_TRANSITIONS
// being checked in the route rather than here.
const MEASUREMENT_UNITS = ["mm", "cm", "in", "mg", "g", "kg", "oz", "ozt"] as const;

const MeasurementValueSchema = z.object({
  value: z.number(),
  unit: z.enum(MEASUREMENT_UNITS),
  originalValue: z.string().max(200).optional(),
  source: z.enum(["supplier", "manual", "calculated"]).optional(),
  isEstimated: z.boolean().optional(),
});

// Keys are MeasurementFieldKey values, but kept as a plain string record
// here (rather than z.enum over every key) so a new field key added to
// the category config doesn't also require a schema.ts edit.
const MeasurementValuesSchema = z
  .record(z.string().max(60), MeasurementValueSchema)
  .refine((o) => Object.keys(o).length <= 40, "too many measurement fields");

export const ItemMeasurementsSchema = z.object({
  category: z.string().trim().max(200).optional(),
  values: MeasurementValuesSchema.optional(),
  ringSize: z
    .object({
      value: z.number(),
      system: z.enum(["US", "UK", "EU", "JP"]),
    })
    .optional(),
  adjustable: z.boolean().optional(),
  stones: z
    .object({
      length: MeasurementValueSchema.optional(),
      width: MeasurementValueSchema.optional(),
      depth: MeasurementValueSchema.optional(),
    })
    .optional(),
  raw: z.string().max(2000).optional(),
  hasCharm: z.boolean().optional(),
  hasPendant: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  earringType: z.enum(["hoop", "stud", "drop"]).optional(),
});

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
    vendorSku: z.string().trim().max(200).optional(),
    category: z.string().trim().max(200).optional(),
    collectionName: z.string().trim().max(200).optional(),
    season: z.string().trim().max(100).optional(),
    boxNumber: z.string().trim().max(100).optional(),
    title: z.string().trim().max(500).optional(),
    title2: z.string().trim().max(500).optional(),
    description: z.string().trim().max(5000).optional(),
    description2: z.string().trim().max(5000).optional(),
    brand: z.string().trim().max(200).optional(),
    upc: z.string().trim().max(200).optional(),
    upc2: z.string().trim().max(200).optional(),
    aliasSku: z.string().trim().max(200).optional(),
    bulletFeatures: z.array(z.string().trim().max(500)).max(10).optional(),
    specs: ItemSpecsSchema.optional(),
    measurements: ItemMeasurementsSchema.optional(),
    pricing: z
      .object({
        costPerUnit: money.optional(),
        msrp: money.optional(),
        ruePrice: money.optional(),
      })
      .optional(),
    active: z.boolean().optional(),
    marketplaceDescription: z
      .object({
        platform: z.enum(DESCRIPTION_PLATFORMS),
        text: z.string().trim().max(5000),
      })
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// --------------------------------------------------------------- catalog

// One hand-entered catalog product: a base SKU plus optional variations
// (same design, hyphen-suffixed SKU — different plating / stone / size).
// Field set mirrors every column on the real Master File (see
// src/lib/import/parseMasterFile.ts COLUMNS) so an item entered by hand
// carries the same information as one that came through the import.
const catalogText = z.string().trim().min(1).max(200);
const optText = (max: number) => z.string().trim().max(max).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

// Per-variant fields. Deliberately NO `msrp` here — MSRP is always shared
// across a variation family (set once on the base item) and is rejected
// server-side if a caller tries to send one per variation, see POST
// /api/catalog. Likewise no category/brand/gender/metal — those are also
// always inherited from the base and have no per-variation override at
// all. `title`/`description` MAY vary per variation (fall back to the
// base item's when omitted) since listing copy can legitimately differ
// per plating/size even though the underlying product doesn't.
const CatalogVariationSchema = z.object({
  suffix: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "letters, digits and hyphens only"),
  // When set, this variation gets its own independent SKU instead of the
  // default "{baseSku}-{suffix}" derivation — the rare case where a
  // variation needs a wholly different SKU family. Still linked to its
  // siblings via variationGroupId. `suffix` above is still required even
  // then (used for display/labeling), but itemNumber comes from here.
  independentSku: optText(200),
  title: optText(500),
  description: z.string().trim().max(5000).optional(),
  plating: optText(300),
  upc: optText(200),
  upc2: optText(200),
  aliasSku: optText(200),
  totalWeight: z.number().finite().min(0).max(100000).optional(),
  silverWeight: z.number().finite().min(0).max(100000).optional(),
  mainStoneInfo: optText(300),
  mainStoneColor: optText(200),
  mainStoneType: optText(200),
  restStoneInfo: optText(300),
  restStoneColor: optText(200),
  restStoneType: optText(200),
  stoneSetting: optText(200),
  pearlSize: optText(100),
  pearlType: optText(200),
  clasp: optText(200),
  // Structured measurements can differ per variation (e.g. a ring size
  // GP-6 variant needs its own ring_size even though the base item has
  // none set yet) — falls back to the base item's `measurements` when
  // omitted. Validated against the shared `category` (never per-variation)
  // in POST /api/catalog, same rule as the base item's own measurements.
  measurements: ItemMeasurementsSchema.optional(),
});

export const CatalogItemCreateSchema = z.object({
  sku: catalogText,
  title: z.string().trim().min(1).max(500),
  title2: optText(500),
  description: z.string().trim().max(5000).optional(),
  description2: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(200),
  brand: optText(200),
  metal: optText(200),
  plating: optText(300),
  msrp: money.optional(),
  newMsrp: money.optional(),
  ruePrice: money.optional(),
  effectiveDate: isoDate,
  upc: optText(200),
  upc2: optText(200),
  aliasSku: optText(200),
  bulletFeatures: z.array(z.string().trim().max(500)).max(10).optional(),
  totalWeight: z.number().finite().min(0).max(100000).optional(),
  silverWeight: z.number().finite().min(0).max(100000).optional(),
  mainStoneInfo: optText(300),
  mainStoneColor: optText(200),
  mainStoneType: optText(200),
  restStoneInfo: optText(300),
  restStoneColor: optText(200),
  restStoneType: optText(200),
  stoneSetting: optText(200),
  pearlSize: optText(100),
  pearlType: optText(200),
  gender: optText(100),
  tcw: optText(100),
  totalCaratWeight: optText(100),
  allSpecs: optText(500),
  // Structured, category-driven measurements (see src/lib/measurements/).
  // `clasp` stays as its own top-level SpecsSchema field (not a
  // measurement) since it's a component name/description, not a number.
  clasp: optText(200),
  measurements: ItemMeasurementsSchema.optional(),
  // Per-marketplace description overrides, set at creation time the same
  // way the general description is — keyed by DESCRIPTION_PLATFORMS. Only
  // non-empty entries are kept; see POST /api/catalog.
  marketplaceDescriptions: z.record(z.enum(DESCRIPTION_PLATFORMS), z.string().trim().max(5000)).optional(),
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

// Pipeline transition rules live in one client-safe module shared with the
// PO detail page's buttons — see src/lib/purchase-orders/transitions.ts.
export { isValidPoTransition } from "@/lib/purchase-orders/transitions";

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

export const QuotationManualSchema = z
  .object({
    // Exactly one of these two is expected — an existing vendor picked from
    // the dropdown, or a brand-new vendor name typed into the "+ Add new
    // vendor" option at the end of it. The route resolves vendorName to a
    // Vendor doc (creating one if the name doesn't exist yet) rather than
    // requiring the vendor to be seeded first, same as the exact-name
    // auto-create pattern used by the Monday pull.
    vendorId: objectId.optional(),
    vendorName: z.string().trim().min(1).max(200).optional(),
    poNumber: z.string().trim().max(200).optional(),
    receivedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    season: z.string().trim().max(120).optional(),
    // Labels of the quote-level custom columns, for reference/echo.
    customColumns: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    items: z.array(QuoteManualItemSchema).min(1, "add at least one item").max(200),
  })
  .refine((b) => !!b.vendorId !== !!b.vendorName, {
    message: "Provide either vendorId or vendorName, not both or neither",
    path: ["vendorId"],
  });

export const QuotationRowPatchSchema = z
  .object({
    reviewStatus: z.enum(["approved", "rejected", "needs_review"]).optional(),
    coercedOverrides: z.record(z.string().max(100), z.unknown()).optional(),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// PATCH /api/quotations/[quotationId] — quote-level additions. Today only
// drives the "+ Add column" / "remove column" controls on the review page;
// kept as a discriminated union so new quote-level actions can be added
// without widening a single schema into something ambiguous.
const customColumnLabel = z
  .string()
  .trim()
  .min(1, "label is required")
  .max(60, "label is too long")
  // Reject labels that would collide with a standard quote field — those
  // already have their own column, and letting a reviewer add a custom
  // column with the same label would hide the standard value under a
  // custom key with no linkage back.
  .refine((s) => !/^[.\s]+$/.test(s), "label can't be blank or dots only");

export const QuotationPatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_custom_column"), label: customColumnLabel }),
  z.object({ op: z.literal("remove_custom_column"), label: customColumnLabel }),
]);

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

// ----------------------------------------------------------------- users

const userName = z.string().trim().min(1).max(120);
const userEmail = z.string().trim().toLowerCase().email().max(200);
// Same floor as the NextAuth credentials provider assumes — bcrypt itself
// truncates at 72 bytes, so there's no ceiling worth enforcing here.
const userPassword = z.string().min(8).max(200);

export const UserCreateSchema = z.object({
  name: userName,
  email: userEmail,
  password: userPassword,
  role: z.enum(ROLES),
});

// Admin editing an existing user: role, active, and name are the plain
// controls handled here. Password reset is deliberately NOT a field on
// this schema any more — resetting another user's password now requires
// the admin's own password + a 2FA code sent to the admin's own email
// (see AdminResetPasswordRequestSchema / .../reset-password/route.ts), so
// there is no direct "just PATCH a new password in" path left. Email is
// also not editable here — it's the sign-in identity; changing an
// account's own email is a self-service, 2FA-gated flow (see
// ChangeEmailRequestSchema), not something folded into this admin form.
export const UserPatchSchema = z
  .object({
    name: userName.optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// Self-service — any signed-in user edits their own notification
// preferences from Settings > Notifications. Distinct from UserPatchSchema
// (admin-only, edits *other* users' role/active/password): this one is
// scoped to the caller's own account and only ever touches this one field.
export const NotificationPrefsPatchSchema = z
  .object({
    poStatusChanges: z.boolean().optional(),
    mondaySyncErrors: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

// Each 2FA-gated account-security action below follows the same two-step
// shape as the existing login OTP flow: a "request" call validates the
// pre-conditions (current password, etc.) and emails a code; a separate
// "verify" call (shared /api/auth/otp/verify-generic, keyed by purpose)
// turns that code into a short-lived, single-use sessionTicket; the
// action's own "confirm" call then takes ONLY that ticket (never the raw
// code, and never re-sending the sensitive fields) and performs the
// mutation. This keeps every flow consistent and means a ticket — not a
// code guess — is what ultimately authorizes the write.

// Self-service password change from Settings > Change password. Unlike
// UserPatchSchema's `password` field (an admin resetting someone else's
// password with no proof of the old one), this always requires the
// caller's current password up front, re-verified against the hash before
// a code is even sent.
export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: userPassword,
  })
  .refine((b) => b.currentPassword !== b.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

// Carries newPassword again (rather than staging it server-side against
// the OTP record, which would mean holding a not-yet-applied password
// value in the DB) — the sessionTicket is what actually authorizes the
// write; newPassword here just says what to write once authorized.
export const ChangePasswordConfirmSchema = z.object({
  sessionTicket: z.string().min(1),
  newPassword: userPassword,
});

// Admin resetting a DIFFERENT user's password (Users & Roles). The admin
// proves THEIR OWN identity — their own password, then a code emailed to
// their own account address — not the target's.
export const AdminResetPasswordRequestSchema = z.object({
  adminPassword: z.string().min(1, "Your password is required"),
  newPassword: userPassword,
});

export const AdminResetPasswordConfirmSchema = z.object({
  sessionTicket: z.string().min(1),
  newPassword: userPassword,
});

// Self-service email change (Settings > Your account). The code is sent to
// the NEW address, proving the caller actually controls it before the
// account's sign-in identity changes.
export const ChangeEmailRequestSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: z.string().trim().toLowerCase().email().max(200),
});

export const ChangeEmailConfirmSchema = z.object({
  sessionTicket: z.string().min(1),
});

// Shared verify step for all three flows above (and reusable by any future
// one) — takes the purpose + code, returns a sessionTicket on success. Kept
// separate from the existing login OtpVerifySchema-equivalent in
// /api/auth/otp/verify/route.ts, which is wired specifically into
// NextAuth's authorize() and stays untouched.
export const OtpVerifyGenericSchema = z.object({
  purpose: z.enum(["change_password", "admin_reset", "change_email"]),
  code: z.string().trim().regex(/^\d{6}$/, "must be a 6-digit code"),
});

// ----------------------------------------------- catalog conflicts

// Reviewer's decision on a pending catalog conflict. `accept` applies
// the incoming PI value to the item; `keep` closes the conflict without
// mutating the item; `custom` writes a third value the reviewer typed.
export const ConflictResolveSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("keep") }),
  z.object({ decision: z.literal("accept") }),
  z.object({
    decision: z.literal("custom"),
    customValue: z.union([z.string().trim().max(500), z.number().finite()]),
  }),
]);

// -------------------------------------------------- shared query params

export const StatusQuerySchema = z.string().trim().min(1).max(60);
