// Mock data for the client-facing presentation build (/present routes).
// Shapes mirror the real Mongoose schemas — see src/models/ — so the
// demo reads as this app's actual data model, not a generic placeholder.

export type ItemStatus =
  | "quoted"
  | "review_pending"
  | "approved"
  | "rejected"
  | "hold"
  | "sample_ordered"
  | "sample_received"
  | "photography"
  | "final_review"
  | "sku_permanent"
  | "po_sent"
  | "receiving"
  | "live"
  | "discontinued";

export interface MockItem {
  id: string;
  itemNumber: string | null;
  sampleSku: string;
  vendorName: string;
  category: string;
  status: ItemStatus;
  metal: string;
  msrp: number | null;
  masterRecordComplete: boolean;
  imageCompleteness: { main: boolean; sides: boolean; models: boolean };
}

export const MOCK_ITEMS: MockItem[] = [
  { id: "1", itemNumber: "JAM-10482", sampleSku: "SAM-2291", vendorName: "Silvertree Imports", category: "Ring", status: "live", metal: "14K Gold Plated", msrp: 68, masterRecordComplete: true, imageCompleteness: { main: true, sides: true, models: true } },
  { id: "2", itemNumber: "JAM-10483", sampleSku: "SAM-2292", vendorName: "Silvertree Imports", category: "Pendant", status: "final_review", metal: "Sterling Silver", msrp: 54, masterRecordComplete: false, imageCompleteness: { main: true, sides: true, models: false } },
  { id: "3", itemNumber: null, sampleSku: "SAM-2305", vendorName: "Moonstone Traders", category: "Bracelet", status: "sample_received", metal: "Brass", msrp: null, masterRecordComplete: false, imageCompleteness: { main: false, sides: false, models: false } },
  { id: "4", itemNumber: null, sampleSku: "SAM-2306", vendorName: "Moonstone Traders", category: "Ring", status: "sample_ordered", metal: "Moissanite / Silver", msrp: null, masterRecordComplete: false, imageCompleteness: { main: false, sides: false, models: false } },
  { id: "5", itemNumber: null, sampleSku: "SAM-2298", vendorName: "Karat & Co", category: "Necklace", status: "review_pending", metal: "18K Gold Vermeil", msrp: null, masterRecordComplete: false, imageCompleteness: { main: false, sides: false, models: false } },
  { id: "6", itemNumber: null, sampleSku: "SAM-2287", vendorName: "Karat & Co", category: "Earrings", status: "rejected", metal: "Sterling Silver", msrp: null, masterRecordComplete: false, imageCompleteness: { main: false, sides: false, models: false } },
  { id: "7", itemNumber: "JAM-10401", sampleSku: "SAM-2201", vendorName: "Blue Nile Wholesale", category: "Ring", status: "po_sent", metal: "14K Gold Plated", msrp: 72, masterRecordComplete: false, imageCompleteness: { main: true, sides: false, models: false } },
  { id: "8", itemNumber: "JAM-10390", sampleSku: "SAM-2180", vendorName: "Blue Nile Wholesale", category: "Bracelet", status: "receiving", metal: "Sterling Silver", msrp: 45, masterRecordComplete: false, imageCompleteness: { main: true, sides: true, models: false } },
];

export const STATUS_LABEL: Record<ItemStatus, string> = {
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

export const STATUS_TONE: Record<ItemStatus, "good" | "warn" | "critical" | "neutral" | "brass"> = {
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

export type POStatus =
  | "waiting_for_sample_po"
  | "negotiating"
  | "send_to_vendor"
  | "pi_confirmed_pending"
  | "pi_confirmed"
  | "in_transit"
  | "ready_to_ship"
  | "shipment_received";

export interface MockPO {
  id: string;
  poNumber: string;
  vendorName: string;
  status: POStatus;
  lineItemCount: number;
  poTotal: number;
  backOfficeChecklist: {
    images: boolean;
    data: boolean;
    pricing: boolean;
    jmUpdate: boolean;
    onMaster: boolean;
    descriptions: boolean;
  };
  vendorReplySent: boolean;
}

export const MOCK_POS: MockPO[] = [
  { id: "1", poNumber: "23337", vendorName: "Silvertree Imports", status: "ready_to_ship", lineItemCount: 12, poTotal: 4180, backOfficeChecklist: { images: true, data: true, pricing: true, jmUpdate: true, onMaster: true, descriptions: true }, vendorReplySent: true },
  { id: "2", poNumber: "23412", vendorName: "Blue Nile Wholesale", status: "pi_confirmed", lineItemCount: 8, poTotal: 2640, backOfficeChecklist: { images: true, data: true, pricing: true, jmUpdate: false, onMaster: false, descriptions: true }, vendorReplySent: true },
  { id: "3", poNumber: "23418", vendorName: "Karat & Co", status: "pi_confirmed_pending", lineItemCount: 15, poTotal: 5920, backOfficeChecklist: { images: false, data: false, pricing: true, jmUpdate: false, onMaster: false, descriptions: false }, vendorReplySent: false },
  { id: "4", poNumber: "23405", vendorName: "Moonstone Traders", status: "in_transit", lineItemCount: 6, poTotal: 1840, backOfficeChecklist: { images: true, data: true, pricing: true, jmUpdate: true, onMaster: false, descriptions: true }, vendorReplySent: true },
  { id: "5", poNumber: "23390", vendorName: "Silvertree Imports", status: "shipment_received", lineItemCount: 20, poTotal: 7100, backOfficeChecklist: { images: true, data: true, pricing: true, jmUpdate: true, onMaster: true, descriptions: true }, vendorReplySent: true },
  { id: "6", poNumber: "23421", vendorName: "Blue Nile Wholesale", status: "send_to_vendor", lineItemCount: 4, poTotal: 980, backOfficeChecklist: { images: false, data: false, pricing: false, jmUpdate: false, onMaster: false, descriptions: false }, vendorReplySent: false },
];

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  waiting_for_sample_po: "Waiting for sample PO",
  negotiating: "Negotiating",
  send_to_vendor: "Send to vendor",
  pi_confirmed_pending: "PI confirmed pending",
  pi_confirmed: "PI confirmed",
  in_transit: "In transit",
  ready_to_ship: "Ready to ship",
  shipment_received: "Shipment received",
};

export const PO_STATUS_TONE: Record<POStatus, "good" | "warn" | "critical" | "neutral" | "brass"> = {
  waiting_for_sample_po: "neutral",
  negotiating: "neutral",
  send_to_vendor: "warn",
  pi_confirmed_pending: "warn",
  pi_confirmed: "brass",
  in_transit: "brass",
  ready_to_ship: "good",
  shipment_received: "good",
};

export type PaymentStatus = "open" | "deposit_submitted" | "paid" | "archived";

export interface MockPayment {
  id: string;
  poNumber: string;
  vendorName: string;
  tranche: "deposit" | "balance" | "prepayment" | "credit";
  amountDue: number;
  dueDate: string;
  status: PaymentStatus;
  overdue: boolean;
}

export const MOCK_PAYMENTS: MockPayment[] = [
  { id: "1", poNumber: "23337", vendorName: "Silvertree Imports", tranche: "balance", amountDue: 2090, dueDate: "2026-09-02", status: "open", overdue: false },
  { id: "2", poNumber: "23412", vendorName: "Blue Nile Wholesale", tranche: "deposit", amountDue: 792, dueDate: "2026-08-20", status: "open", overdue: true },
  { id: "3", poNumber: "23390", vendorName: "Silvertree Imports", tranche: "balance", amountDue: 3550, dueDate: "2026-08-10", status: "paid", overdue: false },
  { id: "4", poNumber: "23405", vendorName: "Moonstone Traders", tranche: "deposit", amountDue: 552, dueDate: "2026-08-28", status: "deposit_submitted", overdue: false },
  { id: "5", poNumber: "23418", vendorName: "Karat & Co", tranche: "prepayment", amountDue: 1776, dueDate: "2026-09-10", status: "open", overdue: false },
];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  open: "Open",
  deposit_submitted: "Deposit submitted",
  paid: "Paid",
  archived: "Archived",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "good" | "warn" | "critical" | "neutral" | "brass"> = {
  open: "warn",
  deposit_submitted: "brass",
  paid: "good",
  archived: "neutral",
};

export interface MockImportRow {
  id: string;
  sku: string;
  rawMetal: string;
  coercedMetal: string | null;
  msrp: number | null;
  flags: string[];
  reviewed: boolean;
  duplicateOf: string | null;
}

export const MOCK_IMPORT_ROWS: MockImportRow[] = [
  { id: "1", sku: "JAM-9012", rawMetal: "Brass", coercedMetal: "Brass", msrp: 38, flags: [], reviewed: true, duplicateOf: null },
  { id: "2", sku: "JAM-9013", rawMetal: "14k gp", coercedMetal: "14K Gold Plated", msrp: 62, flags: ["Metal name normalized"], reviewed: true, duplicateOf: null },
  { id: "3", sku: "JAM-9014", rawMetal: "/", coercedMetal: null, msrp: null, flags: ["Placeholder value — needs manual entry"], reviewed: false, duplicateOf: null },
  { id: "4", sku: "JAM-9015", rawMetal: "Sterling", coercedMetal: "Sterling Silver", msrp: 55, flags: ["Date stored as text — parsed as 2026-03-11"], reviewed: false, duplicateOf: null },
  { id: "5", sku: "JAM-9012", rawMetal: "Brass", coercedMetal: "Brass", msrp: 38, flags: ["Duplicate SKU within this file"], reviewed: false, duplicateOf: "JAM-9012 (row 1)" },
];
