import { Types } from "mongoose";
import PurchaseOrder from "@/models/PurchaseOrder";
import QuotationRow from "@/models/QuotationRow";
import Quotation from "@/models/Quotation";
import { linkQuotationFileToPo } from "@/lib/purchase-orders/files";
import logger from "@/lib/logger";
import { formatPoNumber } from "@/lib/purchase-orders/poNumber";

// Links a committed vendor quote to a PurchaseOrder so it shows up on the
// Purchase Orders table. Quote commit only ever wrote Items; without this a
// quote entered by file or by hand never appeared as a PO at all.
//
// Behaviour:
//   - PO number = the quote's poNumber, normalized to the bare number
//     ("PO-22906" / "#22906" -> "22906") so it matches the Monday board's
//     item name for the same PO.
//     A quote with no PO number gets a stable generated one, "Q-<last 6 of
//     the quotation id>".
//   - If a PO with that number already exists (e.g. from the Monday pull),
//     the quote attaches to it instead of creating a duplicate.
//   - Every committed row becomes a line item {itemId, qty, unitCost,
//     totalCost}; an item already on the PO is not added twice, so this is
//     safe to re-run (the backfill migration relies on that).

// One rule for every PO number in the app (see lib/purchase-orders/poNumber).
export function normalizePoNumber(raw: string | null | undefined): string | null {
  return formatPoNumber(raw);
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export type QuotationLike = {
  _id: Types.ObjectId;
  vendorId: Types.ObjectId;
  poNumber?: string | null;
  createdBy?: Types.ObjectId | null;
};

export async function attachQuotationToPurchaseOrder(
  quotation: QuotationLike
): Promise<{ poId: Types.ObjectId; created: boolean; linesAdded: number } | null> {
  const result = await attachInner(quotation);
  // Link back from the quote so its screens can open the PO directly.
  if (result) {
    await Quotation.updateOne({ _id: quotation._id }, { $set: { purchaseOrderId: result.poId } });
    // File the uploaded PO/PI document into the PO's SharePoint folder. A
    // SharePoint hiccup mustn't undo the commit; re-committing retries it.
    try {
      await linkQuotationFileToPo(quotation._id, result.poId);
    } catch (err) {
      logger.error("quote commit: filing the PO document in SharePoint failed", {
        quotationId: String(quotation._id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

async function attachInner(
  quotation: QuotationLike
): Promise<{ poId: Types.ObjectId; created: boolean; linesAdded: number } | null> {
  const rows = await QuotationRow.find({
    quotationId: quotation._id,
    committedItemId: { $ne: null },
  })
    .select("committedItemId coerced")
    .lean();
  if (rows.length === 0) return null;

  const poNumber =
    normalizePoNumber(quotation.poNumber) ?? `Q-${String(quotation._id).slice(-6).toUpperCase()}`;

  // One line per distinct item. Rows that merged into the same item (two
  // quote lines with the same CZ number) are combined: quantities and line
  // totals summed, last non-empty unit price kept.
  const lines = new Map<string, { itemId: Types.ObjectId; qty?: number; unitCost?: number; totalCost?: number }>();
  let quotedPoTotal: number | undefined;
  for (const r of rows) {
    const c = (r.coerced ?? {}) as Record<string, unknown>;
    const id = String(r.committedItemId);
    const qty = num(c.qty);
    const unitCost = num(c.price);
    const totalCost = num(c.totalPrice) ?? (qty != null && unitCost != null ? qty * unitCost : undefined);
    quotedPoTotal = num(c.totalPo) ?? quotedPoTotal;
    const prev = lines.get(id);
    if (!prev) {
      lines.set(id, { itemId: r.committedItemId as Types.ObjectId, qty, unitCost, totalCost });
    } else {
      if (qty != null) prev.qty = (prev.qty ?? 0) + qty;
      if (totalCost != null) prev.totalCost = (prev.totalCost ?? 0) + totalCost;
      if (unitCost != null) prev.unitCost = unitCost;
    }
  }

  const existing = await PurchaseOrder.findOne({ poNumber });
  if (existing) {
    const already = new Set(existing.lineItems.map((l) => String(l.itemId)));
    const toAdd = [...lines.values()].filter((l) => !already.has(String(l.itemId)));
    for (const l of toAdd) existing.lineItems.push(l);
    if (!existing.quotationIds.some((q) => String(q) === String(quotation._id))) {
      existing.quotationIds.push(quotation._id);
    }
    // Only fill a total that's missing — a total that came from Monday or
    // was typed by someone is authoritative over a derived one.
    if (existing.poTotal == null) {
      const sum = existing.lineItems.reduce((s, l) => s + (l.totalCost ?? 0), 0);
      existing.poTotal = quotedPoTotal ?? (sum > 0 ? sum : undefined);
    }
    await existing.save();
    return { poId: existing._id, created: false, linesAdded: toAdd.length };
  }

  const lineItems = [...lines.values()];
  const sum = lineItems.reduce((s, l) => s + (l.totalCost ?? 0), 0);
  try {
    const po = await PurchaseOrder.create({
      poNumber,
      vendorId: quotation.vendorId,
      source: "quotation",
      quotationIds: [quotation._id],
      orderPurpose: { category: "stock" },
      lineItems,
      poTotal: quotedPoTotal ?? (sum > 0 ? sum : undefined),
      statusHistory: [{ status: "send_to_vendor", changedBy: quotation.createdBy ?? undefined }],
    });
    return { poId: po._id, created: true, linesAdded: lineItems.length };
  } catch (err) {
    // Two commits racing on the same new PO number: the unique index rejects
    // the second insert. Retry once, which now takes the "existing" branch.
    if ((err as { code?: number }).code === 11000) return attachInner(quotation);
    throw err;
  }
}
