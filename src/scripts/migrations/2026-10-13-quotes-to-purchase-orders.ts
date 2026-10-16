import "@/models/register";
import Quotation from "@/models/Quotation";
import PurchaseOrder from "@/models/PurchaseOrder";
import { attachQuotationToPurchaseOrder } from "@/lib/purchase-orders/fromQuotation";

// Quotes committed before 2026-10-13 created Items but never a PurchaseOrder,
// so they were missing from the Purchase Orders table. This links every
// quote that has at least one committed row to its PO (creating the PO if
// needed). Idempotent — attachQuotationToPurchaseOrder skips line items
// already on the PO.
export const name = "2026-10-13-quotes-to-purchase-orders";
export const note = "create/link purchase orders for already-committed vendor quotes";

export async function up(): Promise<void> {
  await PurchaseOrder.syncIndexes();

  const quotations = await Quotation.find({ itemIds: { $exists: true, $ne: [] } })
    .select("_id vendorId poNumber createdBy")
    .lean();

  let created = 0;
  let attached = 0;
  for (const q of quotations) {
    const result = await attachQuotationToPurchaseOrder(q);
    if (!result) continue;
    if (result.created) created++;
    else attached++;
  }
  console.log(`  ${quotations.length} committed quotes: ${created} POs created, ${attached} attached to existing POs`);
}
