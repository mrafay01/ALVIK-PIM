import type { ItemStatus, PoStatus, Role, DescriptionPlatform } from "@/lib/enums";
import { CHECKLIST_DONE } from "@/lib/purchase-orders/transitions";

type Tone = "good" | "warn" | "critical" | "neutral" | "brass";

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  quoted: "Quoted",
  review_pending: "Review pending",
  approved: "Approved",
  rejected: "Rejected",
  hold: "Hold",
  sample_ordered: "Sample ordered",
  sample_received: "Sample received",
  photography: "Photography",
  final_review: "Final review",
  sku_permanent: "SKU permanent",
  po_sent: "PO sent",
  receiving: "Receiving",
  live: "Live",
  discontinued: "Discontinued",
};

export const ITEM_STATUS_TONE: Record<ItemStatus, Tone> = {
  quoted: "neutral",
  review_pending: "warn",
  approved: "brass",
  rejected: "critical",
  hold: "warn",
  sample_ordered: "brass",
  sample_received: "brass",
  photography: "brass",
  final_review: "warn",
  sku_permanent: "brass",
  po_sent: "brass",
  receiving: "brass",
  live: "good",
  discontinued: "neutral",
};

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  waiting_for_sample_po: "Waiting for sample PO",
  negotiating: "Negotiating",
  send_to_vendor: "Send to vendor",
  pi_confirmed_pending: "PI confirmed pending",
  pi_confirmed: "PI confirmed",
  in_transit: "In transit",
  ready_to_ship: "Ready to ship",
  shipment_received: "Shipment received",
};

export const PO_STATUS_TONE: Record<PoStatus, Tone> = {
  waiting_for_sample_po: "neutral",
  negotiating: "neutral",
  send_to_vendor: "warn",
  pi_confirmed_pending: "warn",
  pi_confirmed: "brass",
  in_transit: "brass",
  ready_to_ship: "good",
  shipment_received: "good",
};

const CHECKLIST_LABEL: Record<string, string> = {
  images: "Images",
  data: "Data",
  pricing: "Pricing",
  jmUpdate: "Jm updated",
  onMaster: "On master",
  descriptions: "Descriptions",
};

const CHECKLIST_DONE_VALUE = CHECKLIST_DONE;

export function checklistLabel(field: string): string {
  return CHECKLIST_LABEL[field] ?? field;
}

export function isChecklistFieldDone(field: string, value: string | undefined): boolean {
  return !!value && value === CHECKLIST_DONE_VALUE[field];
}

export const DESCRIPTION_PLATFORM_LABEL: Record<DescriptionPlatform, string> = {
  macys: "Macy's",
  kohls: "Kohl's",
  shopify: "Shopify",
  target: "Target",
  ruelala: "Rue La La",
  belk: "Belk",
};

export const ROLE_LABEL: Record<Role, string> = {
  administrator: "Administrator",
  buyer_merchandiser: "Buyer / Merchandiser",
  buying_purchasing: "Buying & Purchasing",
  warehouse_receiving: "Warehouse Receiving",
  photography: "Photography",
  marketplace_listing: "Marketplace Listing",
};
