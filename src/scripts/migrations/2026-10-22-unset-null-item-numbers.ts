import Item from "@/models/Item";

// Items created by the Monday pull were saved with itemNumber: null. The
// unique itemNumber index counts null as a value, so every Monday item
// after the first was rejected. Removing the null field (rather than
// storing null) lets any number of items wait for their SKU.
export const name = "2026-10-22-unset-null-item-numbers";
export const note = "Item: remove itemNumber: null so items without a SKU don't collide";

export async function up(): Promise<void> {
  const r = await Item.updateMany({ itemNumber: { $type: "null" } }, { $unset: { itemNumber: "" } });
  console.log(`  cleared itemNumber: null on ${r.modifiedCount} item(s)`);
}
