/**
 * Demo data for the Alvik PIM showcase app: vendors, catalog products (with
 * variations), un-verified items, purchase orders across every stage, vendor
 * quotes with their line items, and a few catalog conflicts.
 *
 * SAFETY: only runs against a database named "alvik_pim_demo". Each run
 * replaces the previous demo data (vendors, items, POs, quotes, conflicts,
 * change history); users are never touched.
 *
 * Run with: npm run seed:demo
 */
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import Vendor from "@/models/Vendor";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import CatalogConflict from "@/models/CatalogConflict";
import CatalogChange from "@/models/CatalogChange";
import User from "@/models/User";
import { PO_STATUSES, type PoStatus } from "@/lib/enums";
import { CHECKLIST_DONE } from "@/lib/purchase-orders/transitions";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

const DEMO_DB = "alvik_pim_demo";

// The few fields read back from inserted documents.
type SeededItem = {
  _id: Types.ObjectId;
  vendorSku?: string;
  specs?: { weight?: { totalG?: number } };
  pricingHistory?: { costPerUnit?: number }[];
};
type SeededPo = { _id: Types.ObjectId; poNumber: string; vendorId: Types.ObjectId; createdAt: Date; lineItems: { itemId: Types.ObjectId }[] };

// ---------------------------------------------------------------- random
// Seeded, so every run produces the same demo data.
let seed = 20261119;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
const chance = (p: number) => rand() < p;
const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * DAY - int(0, 20) * 3_600_000);

// ---------------------------------------------------------------- catalog vocabulary
const VENDORS = [
  ["Eshine Jewelry", "Lily Chen", "Net 30"],
  ["Kirin Silver Co.", "Marcus Wu", "Net 45"],
  ["Sunny Craft", "Sunny Zhao", "30% deposit"],
  ["Sam Pearl", "Samuel Lin", "Net 30"],
  ["Rose Atelier", "Rosa Huang", "Net 60"],
  ["Beretta Designs", "Paolo Bianchi", "Net 30"],
  ["Landy Jewelry", "Andy Liang", "50% deposit"],
  ["China Silver Works", "Grace Xu", "Net 30"],
  ["Ying Xin Silver", "Kevin Yang", "Net 45"],
  ["Olia Studio", "Olivia Park", "Net 30"],
  ["Anfook", "Tony Fok", "Net 30"],
  ["Artful Gems", "Priya Nair", "Net 60"],
  ["Longlong Jewelry", "Jason Long", "30% deposit"],
  ["Yusheng", "Helen Su", "Net 30"],
  ["Langtong", "Victor Tang", "Net 45"],
  ["Feyfine", "Fiona Fey", "Net 30"],
  ["Qingdao Pearl", "Leo Qin", "Net 30"],
  ["Diya Crafts", "Diya Shah", "50% deposit"],
  ["DancingDream", "Mia Dang", "Net 30"],
  ["Mogo Silver", "Mo Gao", "Net 45"],
] as const;

const CATEGORIES = [
  { name: "Ring", prefix: "R", styles: ["Halo", "Solitaire", "Eternity Band", "Stackable", "Cocktail", "Three-Stone", "Signet"], w: [2.2, 5.5], price: [39, 129] },
  { name: "Earring", prefix: "E", styles: ["Stud", "Huggie Hoop", "Drop", "Climber", "Hoop", "Halo Stud", "Threader"], w: [1.4, 4.8], price: [29, 99] },
  { name: "Necklace", prefix: "N", styles: ["Tennis", "Station", "Layered", "Choker", "Bar", "Lariat"], w: [4, 14], price: [49, 179] },
  { name: "Pendant", prefix: "P", styles: ["Heart", "Initial", "Teardrop", "Cross", "Star", "Medallion", "Moon"], w: [1.8, 6], price: [35, 119] },
  { name: "Bracelet", prefix: "B", styles: ["Tennis", "Charm", "Link", "Bolo", "Cuff", "Paperclip"], w: [5, 16], price: [45, 169] },
  { name: "Bangle", prefix: "BG", styles: ["Hinged", "Open", "Stackable", "Twisted", "Pavé"], w: [8, 20], price: [59, 189] },
  { name: "Anklet", prefix: "A", styles: ["Chain", "Charm", "Beaded", "Station"], w: [2, 6], price: [25, 79] },
] as const;

const STONES = ["Cubic Zirconia", "Freshwater Pearl", "Created Sapphire", "Created Emerald", "Opal", "Moissanite", "Created Ruby", "Amethyst", "Blue Topaz", "Mother of Pearl"];
const STONE_COLORS = ["White", "Blue", "Green", "Pink", "Red", "Purple", "Champagne", "Black"];
const ADJECTIVES = ["Classic", "Petite", "Vintage", "Modern", "Delicate", "Bold", "Twisted", "Celestial", "Floral", "Geometric", "Radiant", "Infinity"];
const PLATINGS = ["White Gold Plating", "14K Gold Plating", "18K Rose Gold Plating", "Two-Tone Plating", "Rhodium Plating"];
const BRANDS = ["GiGiGirl", "Genevive", "Rachel Glauber"];
const GENDERS = ["Women", "Women", "Women", "Men", "Kids", "Teens"];
const COLLECTIONS = ["Spring Bloom", "Holiday Sparkle", "Everyday Essentials", "Bridal", "Celestial", "Heritage", "Summer Glow"];
const SEASONS = ["SS26", "FW26", "Holiday 26", "SS27"];
const CLASPS = ["Lobster", "Spring ring", "Box clasp", "Toggle", "Push back", "Lever back"];
const VARIANT_SUFFIXES = [["GP", "14K Gold Plating"], ["RP", "18K Rose Gold Plating"], ["WG", "White Gold Plating"]] as const;

function title(cat: (typeof CATEGORIES)[number], stone: string, style: string) {
  return `${pick(ADJECTIVES)} ${stone} ${style} ${cat.name}`;
}

function description(cat: (typeof CATEGORIES)[number], stone: string, metal: string, plating: string) {
  return `Crafted in ${metal.replace(".925 ", "")} with ${plating.toLowerCase()}, this ${cat.name.toLowerCase()} features ${stone.toLowerCase()} accents for an elegant everyday look.`;
}

function bullets(stone: string, metal: string, plating: string) {
  return [`${metal}`, `${plating}`, `${stone} accents`, "Nickel-free and hypoallergenic", "Gift box included"];
}

function placeholderMedia(key: string, full: boolean, partial: boolean) {
  const media: Record<string, unknown>[] = [];
  const add = (sub: "main" | "sides" | "models", name: string, seq: number) =>
    media.push({
      sharePointItemId: `demo-${key}-${sub}-${seq}`,
      url: `https://picsum.photos/seed/${encodeURIComponent(name)}/1200/1200`,
      subfolder: sub,
      sequence: seq,
      name,
      uploadedAt: daysAgo(int(5, 120)),
    });
  if (full || partial) add("main", `${key}.jpg`, 0);
  if (full) {
    add("sides", `${key}-S1.jpg`, 1);
    add("sides", `${key}-S2.jpg`, 2);
    add("models", `${key}-M1.jpg`, 1);
  } else if (partial && chance(0.5)) {
    add("sides", `${key}-S1.jpg`, 1);
  }
  const has = (s: string) => media.some((m) => m.subfolder === s);
  return { media, imageCompleteness: { main: has("main"), sides: has("sides"), models: has("models") } };
}

// ---------------------------------------------------------------- main
async function main() {
  await connectDB();
  const dbName = mongoose.connection.db?.databaseName;
  if (dbName !== DEMO_DB) {
    console.error(`Refusing to run: connected to "${dbName}", expected "${DEMO_DB}".`);
    process.exit(1);
  }

  const admin = await User.findOne({ role: "administrator" }).select("_id").lean();
  const adminId = admin?._id;

  // Clear the previous demo data (never users).
  await Promise.all([
    Vendor.deleteMany({}),
    Item.deleteMany({}),
    PurchaseOrder.deleteMany({}),
    Quotation.deleteMany({}),
    QuotationRow.deleteMany({}),
    CatalogConflict.deleteMany({}),
    CatalogChange.deleteMany({}),
  ]);

  // Vendors
  const vendors = await Vendor.insertMany(
    VENDORS.map(([name, contact, terms]) => ({
      name,
      contact,
      terms,
      email: `${contact.split(" ")[0].toLowerCase()}@${name.toLowerCase().replace(/[^a-z]/g, "")}.example`,
      phone: `+86 ${int(130, 189)} ${int(1000, 9999)} ${int(1000, 9999)}`,
    }))
  );
  const vendorIds = vendors.map((v) => v._id);

  // ---------------------------------------------------------- catalog items
  const catalogDocs: Record<string, unknown>[] = [];
  const usedNumbers = new Set<string>();
  let baseCount = 0;
  while (catalogDocs.length < 340) {
    const cat = pick(CATEGORIES);
    let num: string;
    do num = `${cat.prefix}${int(1000, 9899)}`;
    while (usedNumbers.has(num));
    usedNumbers.add(num);
    baseCount++;

    const stone = pick(STONES);
    const style = pick(cat.styles);
    const metal = chance(0.88) ? ".925 Sterling Silver" : "Brass";
    const baseTitle = title(cat, stone, style);
    const brand = pick(BRANDS);
    const gender = pick(GENDERS);
    const vendorId = pick(vendorIds);
    const created = daysAgo(int(1, 150));
    const msrp = int(cat.price[0], cat.price[1]) + 0.99;
    const cost = round2(msrp * (0.18 + rand() * 0.12));
    const totalG = round2(cat.w[0] + rand() * (cat.w[1] - cat.w[0]));
    const groupId = new Types.ObjectId();

    // ~25% of products come in plating variations: base + 1-2 variants.
    const variants: { sku: string; plating: string; suffix: string | null }[] = [{ sku: num, plating: pick(PLATINGS), suffix: null }];
    if (chance(0.25)) {
      const n = int(1, 2);
      for (const [suffix, plating] of VARIANT_SUFFIXES.slice(0, n)) variants.push({ sku: `${num}-${suffix}`, plating, suffix });
    }

    for (const v of variants) {
      const full = chance(0.72);
      const partial = !full && chance(0.6);
      const { media, imageCompleteness } = placeholderMedia(v.sku, full, partial);
      const pendingApproval = chance(0.05);
      const doc: Record<string, unknown> = {
        status: pendingApproval ? "final_review" : pick(["live", "live", "live", "sku_permanent", "receiving"]),
        itemNumber: v.sku,
        baseSku: num,
        variantSuffix: v.suffix,
        variationGroupId: variants.length > 1 ? groupId : undefined,
        vendorId,
        vendorSku: `${pick(["JX", "KS", "YX", "LT", "AF"])}-${int(10000, 99999)}`,
        collectionName: pick(COLLECTIONS),
        season: pick(SEASONS),
        category: cat.name,
        title: v.suffix ? `${baseTitle} (${v.plating.replace(" Plating", "")})` : baseTitle,
        description: description(cat, stone, metal, v.plating),
        bulletFeatures: bullets(stone, metal, v.plating),
        brand,
        upc: `8${int(10000, 99999)}${int(100000, 999999)}`,
        specs: {
          metal,
          plating: v.plating,
          weight: { totalG, silverG: metal === "Brass" ? undefined : round2(totalG * 0.82) },
          gender,
          clasp: ["Necklace", "Bracelet", "Anklet", "Pendant"].includes(cat.name) ? pick(CLASPS) : undefined,
          ringSize: cat.name === "Ring" ? String(int(5, 9)) : undefined,
          chainLength: ["Necklace", "Pendant"].includes(cat.name) ? `${pick([16, 18, 20])}" + 2" ext` : undefined,
          mainStoneColor: pick(STONE_COLORS),
          mainStoneType: stone,
        },
        media,
        imageCompleteness,
        pricingHistory: [
          { costPerUnit: cost, msrp: msrp + 20, currency: "USD", effectiveDate: new Date(created.getTime() - 30 * DAY), source: "master_file" },
          { costPerUnit: cost, msrp, ruePrice: round2(msrp * 0.6), currency: "USD", effectiveDate: created, source: "master_file" },
        ],
        origin: chance(0.85) ? "master_file" : "manual",
        inCatalog: true,
        active: chance(0.96),
        catalogApproval: pendingApproval ? { status: "pending" } : { status: "approved", approvedBy: adminId, approvedAt: created },
        catalogSubmittedAt: pendingApproval ? daysAgo(int(1, 10)) : undefined,
        lastEditedBy: adminId,
        boxNumber: chance(0.7) ? `BX-${int(100, 480)}` : undefined,
        createdAt: created,
        updatedAt: new Date(Math.min(NOW, created.getTime() + int(0, 30) * DAY)),
      };
      if (chance(0.06)) delete (doc.specs as Record<string, unknown>).metal; // a few incomplete records
      doc.masterRecordComplete = isMasterRecordComplete(doc as never);
      catalogDocs.push(doc);
    }
  }
  const catalogItems = (await Item.insertMany(catalogDocs)) as unknown as SeededItem[];

  // ---------------------------------------------------------- PO numbers
  const poNumbers: string[] = [];
  let next = 22410;
  for (let i = 0; i < 210; i++) {
    next += int(1, 9);
    poNumbers.push(String(next));
  }

  // ---------------------------------------------------------- un-verified items
  const unverifiedDocs: Record<string, unknown>[] = [];
  for (let i = 0; i < 110; i++) {
    const cat = pick(CATEGORIES);
    const stone = pick(STONES);
    const plating = pick(PLATINGS);
    const metal = ".925 Sterling Silver";
    const created = daysAgo(int(0, 75));
    const msrp = int(cat.price[0], cat.price[1]) + 0.99;
    const hasSku = chance(0.7);
    const sampleSku = hasSku ? `S-${cat.prefix}${int(100, 999)}${String.fromCharCode(65 + int(0, 25))}` : undefined;
    const full = hasSku && chance(0.35);
    const partial = hasSku && !full && chance(0.4);
    const { media, imageCompleteness } = sampleSku ? placeholderMedia(sampleSku, full, partial) : { media: [], imageCompleteness: { main: false, sides: false, models: false } };
    const doc: Record<string, unknown> = {
      status: pick(["quoted", "review_pending", "approved", "sample_ordered", "sample_received", "photography", "final_review"]),
      sampleSku,
      vendorId: pick(vendorIds),
      vendorSku: `${pick(["JX", "KS", "YX", "LT", "AF"])}-${int(10000, 99999)}`,
      category: cat.name,
      title: title(cat, stone, pick(cat.styles)),
      description: description(cat, stone, metal, plating),
      specs: { metal, plating, weight: { totalG: round2(cat.w[0] + rand() * (cat.w[1] - cat.w[0])) }, mainStoneType: stone },
      media,
      imageCompleteness,
      pricingHistory: [{ costPerUnit: round2(msrp * 0.22), msrp: chance(0.7) ? msrp : undefined, currency: "USD", effectiveDate: created, source: "quotation" }],
      origin: "quotation",
      intakeSource: "manual_quote",
      sourcePoNumber: pick(poNumbers.slice(120)),
      inCatalog: false,
      urgency: chance(0.3) ? pick(["high", "medium"]) : undefined,
      orderReason: pick(["new_item", "stock_replenishment", "customer_order"]),
      createdAt: created,
      updatedAt: new Date(Math.min(NOW, created.getTime() + int(0, 10) * DAY)),
    };
    doc.masterRecordComplete = isMasterRecordComplete(doc as never);
    unverifiedDocs.push(doc);
  }
  const unverifiedItems = (await Item.insertMany(unverifiedDocs)) as unknown as SeededItem[];

  // ---------------------------------------------------------- purchase orders
  // Weighted toward the middle of the pipeline; older POs are further along.
  const STATUS_WEIGHTS: [PoStatus, number][] = [
    ["waiting_for_sample_po", 6],
    ["negotiating", 10],
    ["send_to_vendor", 16],
    ["pi_confirmed_pending", 14],
    ["pi_confirmed", 30],
    ["in_transit", 22],
    ["ready_to_ship", 12],
    ["shipment_received", 40],
  ];
  const weighted = STATUS_WEIGHTS.flatMap(([s, w]) => Array(w).fill(s) as PoStatus[]);
  const allItems = [...catalogItems, ...unverifiedItems];
  const poDocs: Record<string, unknown>[] = [];

  for (let i = 0; i < poNumbers.length; i++) {
    const status = pick(weighted);
    const stageIdx = PO_STATUSES.indexOf(status);
    const age = Math.round(((poNumbers.length - i) / poNumbers.length) * 140) + int(0, 10);
    const orderDate = daysAgo(age);
    const isSample = status === "waiting_for_sample_po" || chance(0.08);

    const lineCount = isSample ? int(1, 3) : int(3, 12);
    const chosen = new Set<number>();
    while (chosen.size < lineCount) chosen.add(int(0, allItems.length - 1));
    const lineItems = [...chosen].map((idx) => {
      const it = allItems[idx];
      const qty = isSample ? int(1, 3) : pick([24, 36, 48, 60, 72, 96, 120, 144, 200, 240]);
      const unitCost = round2((it.pricingHistory?.[0]?.costPerUnit ?? 12) * (0.9 + rand() * 0.2));
      return { itemId: it._id, qty, unitCost, totalCost: round2(qty * unitCost) };
    });
    const poTotal = round2(lineItems.reduce((s, l) => s + l.totalCost, 0));

    // Status history: one entry per stage up to the current one.
    const startIdx = isSample ? 0 : 1;
    const steps = Math.max(1, stageIdx - startIdx + 1);
    const statusHistory = PO_STATUSES.slice(startIdx, stageIdx + 1).map((s, k) => ({
      status: s,
      changedAt: new Date(orderDate.getTime() + Math.round((k / steps) * age * 0.9) * DAY),
      changedBy: adminId,
    }));
    if (statusHistory.length === 0) statusHistory.push({ status, changedAt: orderDate, changedBy: adminId });

    // Checklist: complete from Ready to ship on; partly done before that.
    const locked = status === "ready_to_ship" || status === "shipment_received";
    const checklist: Record<string, string> = {};
    for (const [field, done] of Object.entries(CHECKLIST_DONE)) {
      checklist[field] = locked || (stageIdx >= 4 && chance(0.55)) ? done : chance(0.4) && field === "images" ? "sent_to_photo_guy" : "pending";
    }

    const requestDate = new Date(orderDate.getTime() + int(35, 75) * DAY);
    const created = orderDate;
    const updated = statusHistory[statusHistory.length - 1].changedAt as Date;
    poDocs.push({
      poNumber: poNumbers[i],
      vendorId: pick(vendorIds),
      orderPurpose: { category: isSample ? "sample" : pick(["stock", "stock", "new_collection", "existing_modified", "promo_events", "amazon"]) },
      priority: pick(["low", "medium", "medium", "medium", "high", "high", "critical"]),
      lineItems,
      status,
      imageStatus: locked ? "received" : pick(["pending", "sent_to_photo_guy", "images_received"]),
      backOfficeChecklist: checklist,
      orderDate,
      requestDate,
      vendorConfDate: stageIdx >= 4 ? new Date(orderDate.getTime() + int(3, 12) * DAY) : undefined,
      poTotal,
      prepaymentDeposit: stageIdx >= 4 ? round2(poTotal * 0.3) : undefined,
      remainingBalance: status === "shipment_received" ? 0 : stageIdx >= 4 ? round2(poTotal * 0.7) : poTotal,
      trackingNumber: stageIdx >= 5 ? `${pick(["1Z", "FX", "DHL"])}${int(10000000, 99999999)}${int(100, 999)}` : null,
      joelShipConfirmed: stageIdx >= 6,
      statusHistory,
      source: isSample ? "manual" : "quotation",
      mondayItemId: null,
      createdAt: created,
      updatedAt: new Date(Math.min(NOW, updated.getTime())),
    });
  }
  const pos = (await PurchaseOrder.insertMany(poDocs)) as unknown as SeededPo[];

  // ---------------------------------------------------------- quotes + rows
  const quotes: Record<string, unknown>[] = [];
  const rows: Record<string, unknown>[] = [];
  const quotePos = pos.slice(-45);
  quotePos.forEach((po, qi) => {
    const qid = new Types.ObjectId();
    const status = qi < 32 ? "committed" : qi < 38 ? "reviewed" : "needs_review";
    const fileUpload = chance(0.7);
    const n = int(3, 10);
    let flagged = 0;
    let approved = 0;
    const itemIds: Types.ObjectId[] = [];
    for (let r = 1; r <= n; r++) {
      const cat = pick(CATEGORIES);
      const stone = pick(STONES);
      const committedItem = status === "committed" ? po.lineItems[(r - 1) % po.lineItems.length]?.itemId : null;
      const isFlagged = status === "needs_review" && chance(0.3);
      const reviewStatus = status === "needs_review" ? (chance(0.4) ? "approved" : "needs_review") : chance(0.92) ? "approved" : "rejected";
      if (isFlagged) flagged++;
      if (reviewStatus === "approved") approved++;
      if (committedItem && reviewStatus === "approved") itemIds.push(committedItem as Types.ObjectId);
      rows.push({
        quotationId: qid,
        rowNumber: r,
        coerced: {
          vendorSku: `${pick(["JX", "KS", "YX", "LT", "AF"])}-${int(10000, 99999)}`,
          title: title(cat, stone, pick(cat.styles)),
          category: cat.name,
          "specs.metal": ".925 Sterling Silver",
          "specs.plating": pick(PLATINGS),
          "specs.weight.totalG": round2(cat.w[0] + rand() * (cat.w[1] - cat.w[0])),
          "specs.mainStoneType": stone,
          "specs.quotedQty": pick([24, 48, 72, 120]),
          "specs.laborCostPerGram": round2(0.4 + rand() * 0.6),
          "pricing.msrp": int(cat.price[0], cat.price[1]) + 0.99,
        },
        flags: isFlagged ? [{ field: "specs.weight.totalG", message: "Weight looks unusually high", rawValue: "45g" }] : [],
        reviewStatus,
        reviewedBy: reviewStatus !== "needs_review" ? adminId : undefined,
        reviewedAt: reviewStatus !== "needs_review" ? po.createdAt : undefined,
        committedItemId: committedItem && reviewStatus === "approved" ? committedItem : null,
        createdAt: po.createdAt,
        updatedAt: po.createdAt,
      });
    }
    quotes.push({
      _id: qid,
      vendorId: po.vendorId,
      source: fileUpload ? "file_upload" : "manual",
      sourceFileName: fileUpload ? `${po.poNumber}.xlsx` : undefined,
      poNumber: po.poNumber,
      status,
      totalRows: n,
      flaggedRows: flagged,
      approvedRows: approved,
      rejectedRows: status === "needs_review" ? 0 : n - approved,
      createdBy: adminId,
      itemIds,
      purchaseOrderId: status === "committed" ? po._id : null,
      createdAt: new Date((po.createdAt as Date).getTime() - 2 * DAY),
      updatedAt: po.createdAt,
    });
  });
  await Quotation.insertMany(quotes);
  const insertedRows = await QuotationRow.insertMany(rows);
  await Promise.all(
    quotes
      .filter((q) => q.status === "committed")
      .map((q) => PurchaseOrder.updateOne({ _id: q.purchaseOrderId }, { $set: { quotationIds: [q._id] } }, { timestamps: false }))
  );

  // ---------------------------------------------------------- conflicts + change history
  const conflictFields = [
    { field: "specs.weight.totalG", label: "Total weight", make: (v: number) => round2(v + 0.6 + rand()) },
    { field: "vendorSku", label: "Vendor SKU", make: () => `KS-${int(10000, 99999)}` },
    { field: "specs.ringSize", label: "Ring size", make: () => String(int(5, 9)) },
  ];
  const conflicts: Record<string, unknown>[] = [];
  for (let i = 0; i < 9; i++) {
    const it = catalogItems[int(0, catalogItems.length - 1)];
    const row = insertedRows[int(0, insertedRows.length - 1)];
    const f = conflictFields[i % 2 === 0 ? 0 : 1];
    const current = f.field === "vendorSku" ? it.vendorSku : it.specs?.weight?.totalG ?? 3;
    conflicts.push({
      itemId: it._id,
      quotationId: row.quotationId,
      quotationRowId: row._id,
      field: f.field,
      fieldLabel: f.label,
      catalogValue: current,
      incomingValue: f.make(Number(current) || 3),
      status: "pending",
      createdAt: daysAgo(int(0, 12)),
    });
  }
  const insertedConflicts = await CatalogConflict.insertMany(conflicts);
  await Promise.all(
    insertedConflicts.map((c) => Item.updateOne({ _id: c.itemId }, { $inc: { conflictCount: 1 } }, { timestamps: false }))
  );

  const changes: Record<string, unknown>[] = [];
  for (let i = 0; i < 60; i++) {
    const it = catalogItems[int(0, catalogItems.length - 1)];
    const w = it.specs?.weight?.totalG ?? 3;
    changes.push({
      itemId: it._id,
      field: "specs.weight.totalG",
      fieldLabel: "Total weight",
      oldValue: round2(w - 0.4),
      newValue: w,
      source: pick(["import", "manual_edit", "pi_conflict"]),
      sourceRef: { userId: adminId },
      createdAt: daysAgo(int(1, 90)),
    });
  }
  await CatalogChange.insertMany(changes);

  console.log(
    `Demo data ready in "${dbName}": ${vendors.length} vendors, ${catalogItems.length} catalog items ` +
      `(${baseCount} products), ${unverifiedItems.length} un-verified items, ${pos.length} purchase orders, ` +
      `${quotes.length} quotes (${rows.length} lines), ${conflicts.length} conflicts, ${changes.length} change-history entries.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Demo seed failed:", err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
