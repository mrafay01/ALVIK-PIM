import Item from "@/models/Item";

// Images page: index for the "Broken links" filter on media.linkStatus.
export const name = "2026-10-20-image-link-status";
export const note = "Item: media.linkStatus index for the Images page";

export async function up(): Promise<void> {
  await Item.syncIndexes();
}
