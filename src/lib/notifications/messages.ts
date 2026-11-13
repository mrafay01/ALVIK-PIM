import { PO_STATUS_LABEL } from "@/lib/statusDisplay";
import type { PoStatus } from "@/lib/enums";
import { appUrl } from "./email";
import type { NotifyInput } from "./notify";

// The wording of each notification. Pure: every builder takes plain values
// and returns what notify() sends, so the text is unit-tested and the
// routes only pass facts.

const po = (n: string) => `PO-${n}`;
const statusLabel = (s: string) => PO_STATUS_LABEL[s as PoStatus] ?? s;
const by = (name?: string | null) => (name ? ` by ${name}` : "");

// Statuses that mean stock is on its way to the warehouse.
export const INCOMING_STATUSES: readonly string[] = ["in_transit", "ready_to_ship"];

export function poStageChanged(p: {
  poId: string;
  poNumber: string;
  vendorName?: string | null;
  from: string;
  to: string;
  actorId?: string | null;
  actorName?: string | null;
}): NotifyInput[] {
  const rows = [
    { label: "Purchase order", value: po(p.poNumber) },
    ...(p.vendorName ? [{ label: "Vendor", value: p.vendorName }] : []),
    { label: "Was", value: statusLabel(p.from) },
    { label: "Now", value: statusLabel(p.to) },
    ...(p.actorName ? [{ label: "Changed by", value: p.actorName }] : []),
  ];
  const action = { label: "Open the purchase order", href: appUrl(`/purchase-orders/${p.poId}`) };
  const out: NotifyInput[] = [
    {
      event: "poStatusChanges",
      actorId: p.actorId,
      email: {
        subject: `${po(p.poNumber)} moved to ${statusLabel(p.to)}`,
        eyebrow: "Purchase order",
        heading: `${po(p.poNumber)} is now ${statusLabel(p.to)}`,
        intro: `${po(p.poNumber)} moved from ${statusLabel(p.from)} to ${statusLabel(p.to)}${by(p.actorName)}.`,
        rows,
        action,
      },
    },
  ];
  if (INCOMING_STATUSES.includes(p.to) && !INCOMING_STATUSES.includes(p.from)) {
    out.push({
      event: "poIncoming",
      actorId: p.actorId,
      email: {
        subject: `Incoming: ${po(p.poNumber)} is ${statusLabel(p.to).toLowerCase()}`,
        eyebrow: "Incoming shipment",
        heading: `${po(p.poNumber)} is on its way`,
        intro: `${po(p.poNumber)}${p.vendorName ? ` from ${p.vendorName}` : ""} is now ${statusLabel(p.to)}. Expect it at the warehouse.`,
        rows,
        action,
      },
    });
  }
  return out;
}

export function quoteNeedsReview(p: {
  quotationId: string;
  poNumber?: string | null;
  vendorName?: string | null;
  rows: number;
  flagged: number;
  actorId?: string | null;
  actorName?: string | null;
}): NotifyInput {
  const what = p.poNumber ? `${po(p.poNumber)} quote` : "A vendor quote";
  return {
    event: "quoteNeedsReview",
    actorId: p.actorId,
    email: {
      subject: `${what}${p.vendorName ? ` from ${p.vendorName}` : ""} is waiting for review`,
      eyebrow: "Vendor quote",
      heading: `${what} is ready to review`,
      intro: `${p.actorName ?? "Someone"} added a quote with ${p.rows} line item${p.rows === 1 ? "" : "s"}${
        p.flagged > 0 ? `, ${p.flagged} of them with values to check` : ""
      }. Review it, then commit it to create the items and the purchase order.`,
      rows: [
        ...(p.poNumber ? [{ label: "Purchase order", value: po(p.poNumber) }] : []),
        ...(p.vendorName ? [{ label: "Vendor", value: p.vendorName }] : []),
        { label: "Line items", value: String(p.rows) },
        { label: "Flagged", value: String(p.flagged) },
      ],
      action: { label: "Review the quote", href: appUrl(`/purchase-orders/quotes/${p.quotationId}`) },
    },
  };
}

export type ItemRef = { id: string; sku?: string | null; title?: string | null };

function itemList(items: ItemRef[]) {
  return items.map((i) => ({
    text: [i.sku, i.title].filter(Boolean).join(" · ") || "Item without a SKU",
    href: appUrl(`/items/${i.id}`),
  }));
}

export function quoteCommitted(p: {
  quotationId: string;
  poNumber?: string | null;
  vendorName?: string | null;
  poId?: string | null;
  created: number;
  merged: number;
  conflicts: number;
  actorId?: string | null;
  actorName?: string | null;
}): NotifyInput {
  const what = p.poNumber ? `${po(p.poNumber)} quote` : "A vendor quote";
  return {
    event: "quoteCommitted",
    actorId: p.actorId,
    email: {
      subject: `${what} committed: ${p.created} new item${p.created === 1 ? "" : "s"}`,
      eyebrow: "Vendor quote",
      heading: `${what} was committed`,
      intro: `${p.actorName ?? "Someone"} committed the quote. New items are on Un-Verified Items, waiting to be completed and submitted to the catalog.`,
      rows: [
        ...(p.poNumber ? [{ label: "Purchase order", value: po(p.poNumber) }] : []),
        ...(p.vendorName ? [{ label: "Vendor", value: p.vendorName }] : []),
        { label: "New items", value: String(p.created) },
        { label: "Updated items", value: String(p.merged) },
        ...(p.conflicts > 0 ? [{ label: "Catalog conflicts", value: String(p.conflicts) }] : []),
      ],
      action: p.poId
        ? { label: "Open the purchase order", href: appUrl(`/purchase-orders/${p.poId}`) }
        : { label: "Open Un-Verified Items", href: appUrl("/items") },
    },
  };
}

export function itemsNeedPhotos(p: { poNumber?: string | null; items: ItemRef[]; total: number; actorId?: string | null }): NotifyInput {
  return {
    event: "itemsNeedPhotos",
    actorId: p.actorId,
    email: {
      subject: `${p.total} new item${p.total === 1 ? "" : "s"} need${p.total === 1 ? "s" : ""} photos${p.poNumber ? ` (${po(p.poNumber)})` : ""}`,
      eyebrow: "Images",
      heading: `${p.total} new item${p.total === 1 ? "" : "s"} need${p.total === 1 ? "s" : ""} photos`,
      intro: `These items were just added${p.poNumber ? ` from ${po(p.poNumber)}` : ""} and have no images yet. Each needs a main, a side and a model photo.`,
      list: itemList(p.items),
      listTotal: p.total,
      action: { label: "Open the Images page", href: appUrl("/images?status=none") },
    },
  };
}

export function imagesComplete(p: { item: ItemRef; inCatalog: boolean; actorId?: string | null; actorName?: string | null }): NotifyInput {
  const name = p.item.sku || "An item";
  return {
    event: "imagesComplete",
    actorId: p.actorId,
    email: {
      subject: `${name} has all its photos`,
      eyebrow: "Images",
      heading: `${name} has all its photos`,
      intro: `${p.actorName ?? "Someone"} uploaded the last required photo, so ${name} now has a main, side and model image.${
        p.inCatalog ? "" : " If the rest of its record is complete it can be submitted to the catalog."
      }`,
      rows: p.item.title ? [{ label: "Item", value: p.item.title }] : undefined,
      action: { label: "Open the item", href: appUrl(`/items/${p.item.id}`) },
    },
  };
}

export function catalogConflicts(p: {
  poNumber?: string | null;
  count: number;
  items: ItemRef[];
  actorId?: string | null;
  actorName?: string | null;
}): NotifyInput {
  return {
    event: "catalogConflicts",
    actorId: p.actorId,
    email: {
      subject: `${p.count} catalog conflict${p.count === 1 ? "" : "s"} to resolve${p.poNumber ? ` (${po(p.poNumber)})` : ""}`,
      eyebrow: "Catalog",
      heading: `A vendor PI disagrees with the catalog`,
      intro: `${p.actorName ?? "Someone"} committed a quote${p.poNumber ? ` for ${po(p.poNumber)}` : ""} whose weights, sizes or vendor SKUs differ from the catalog on ${p.count} field${
        p.count === 1 ? "" : "s"
      }. The catalog values were kept; decide which value is right.`,
      list: itemList(p.items),
      listTotal: p.items.length,
      action: { label: "Resolve the conflicts", href: appUrl("/catalog/conflicts") },
    },
  };
}

export function catalogSubmitted(p: { item: ItemRef; actorId?: string | null; actorName?: string | null }): NotifyInput {
  const name = p.item.sku || "An item";
  return {
    event: "catalogSubmitted",
    actorId: p.actorId,
    email: {
      subject: `${name} is waiting for catalog approval`,
      eyebrow: "Catalog",
      heading: `${name} is waiting for your approval`,
      intro: `${p.actorName ?? "Someone"} submitted ${name} to the catalog. It shows on the Catalog's Pending approval tab until an administrator approves it.`,
      rows: p.item.title ? [{ label: "Item", value: p.item.title }] : undefined,
      action: { label: "Review pending items", href: appUrl("/catalog?filter=pending") },
    },
  };
}

export function catalogApproved(p: { item: ItemRef; actorId?: string | null; actorName?: string | null }): NotifyInput {
  const name = p.item.sku || "An item";
  return {
    event: "catalogApproved",
    actorId: p.actorId,
    email: {
      subject: `${name} was approved into the catalog`,
      eyebrow: "Catalog",
      heading: `${name} is in the catalog`,
      intro: `${p.actorName ?? "An administrator"} approved ${name}. It's now part of the catalog.`,
      rows: p.item.title ? [{ label: "Item", value: p.item.title }] : undefined,
      action: { label: "Open the item", href: appUrl(`/items/${p.item.id}`) },
    },
  };
}

export function mondaySyncFailed(p: {
  what: "import" | "push";
  failed: number;
  total?: number;
  messages: string[];
  actorId?: string | null;
  actorName?: string | null;
}): NotifyInput {
  const verb = p.what === "import" ? "Importing from Monday.com" : "Sending POs to Monday.com";
  const scope = p.total ? `${p.failed} of ${p.total}` : String(p.failed);
  return {
    event: "mondaySyncErrors",
    actorId: p.actorId,
    email: {
      subject: `${verb} failed for ${scope} item${p.failed === 1 ? "" : "s"}`,
      eyebrow: "Monday.com",
      heading: `${verb} didn't fully work`,
      intro: `${verb}${by(p.actorName)} failed for ${scope} item${p.failed === 1 ? "" : "s"}. The rest went through. Running it again is safe.`,
      list: p.messages.slice(0, 15).map((text) => ({ text })),
      listTotal: p.messages.length,
      action:
        p.what === "import"
          ? { label: "Open Monday Import", href: appUrl("/admin/monday-pull") }
          : { label: "Open Purchase Orders", href: appUrl("/purchase-orders") },
    },
  };
}
