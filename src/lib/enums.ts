export const ROLES = [
  "administrator",
  "buyer_merchandiser",
  "buying_purchasing",
  "warehouse_receiving",
  "photography",
  "marketplace_listing",
  "accounts_finance",
] as const;
export type Role = (typeof ROLES)[number];

export const ITEM_STATUSES = [
  "quoted",
  "review_pending",
  "approved",
  "rejected",
  "hold",
  "sample_ordered",
  "sample_received",
  "photography",
  "final_review",
  "sku_permanent",
  "po_sent",
  "receiving",
  "live",
  "discontinued",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const PO_STATUSES = [
  "waiting_for_sample_po",
  "negotiating",
  "send_to_vendor",
  "pi_confirmed_pending",
  "pi_confirmed",
  "in_transit",
  "ready_to_ship",
  "shipment_received",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const IMAGE_STATUSES = [
  "pending",
  "sent_to_photo_guy",
  "submitted_on_fiverr",
  "images_received",
  "received",
] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const ORDER_PURPOSE_CATEGORIES = [
  "stock",
  "sample",
  "new_collection",
  "existing_modified",
  "promo_events",
  "amazon",
] as const;
export type OrderPurposeCategory = (typeof ORDER_PURPOSE_CATEGORIES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const URGENCIES = ["high", "medium"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const ORDER_REASONS = ["new_item", "stock_replenishment", "customer_order"] as const;
export type OrderReason = (typeof ORDER_REASONS)[number];

export const IMAGES_CHECKLIST_STATUSES = [
  "pending",
  "sent_to_photo_guy",
  "rush_requested",
  "modify_requested",
  "received",
] as const;

export const DATA_CHECKLIST_STATUSES = ["pending", "received", "waiting_for_vendor_update"] as const;

export const PRICING_CHECKLIST_STATUSES = ["pending", "confirmed"] as const;

export const JM_UPDATE_STATUSES = [
  "pending",
  "waiting_for_price",
  "waiting_for_box_number",
  "updated",
] as const;

export const ON_MASTER_STATUSES = ["pending", "need_msrp", "done"] as const;

export const DESCRIPTIONS_STATUSES = ["pending", "waiting_for_more_items", "done"] as const;

export const QC_RESULTS = ["good", "flagged"] as const;
export type QcResult = (typeof QC_RESULTS)[number];

export const PAYMENT_TRANCHES = ["deposit", "balance", "prepayment", "credit"] as const;
export type PaymentTranche = (typeof PAYMENT_TRANCHES)[number];

export const PAYMENT_STATUSES = ["deposit_submitted", "open", "paid", "archived"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["check", "wire"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const QUOTATION_IMPORT_STATUSES = ["parsed", "needs_review", "imported"] as const;
export type QuotationImportStatus = (typeof QUOTATION_IMPORT_STATUSES)[number];

export const SYNC_LOG_RUN_TYPES = ["monday_push", "monday_pull", "marketplace_export"] as const;
export type SyncLogRunType = (typeof SYNC_LOG_RUN_TYPES)[number];

export const PLATFORMS = ["shopify", "amazon", "macys"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const IMAGE_SUBFOLDERS = ["main", "sides", "models"] as const;
export type ImageSubfolder = (typeof IMAGE_SUBFOLDERS)[number];
