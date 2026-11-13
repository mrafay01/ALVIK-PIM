export const ROLES = [
  "administrator",
  "buyer_merchandiser",
  "buying_purchasing",
  "warehouse_receiving",
  "photography",
  "catalog_manager",
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

// How an item entered the system — drives whether it belongs in the
// finalized catalog and whether it needs admin approval to get there.
export const ITEM_ORIGINS = ["master_file", "manual", "quotation"] as const;
export type ItemOrigin = (typeof ITEM_ORIGINS)[number];

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

export const QUOTATION_STATUSES = ["parsing", "needs_review", "reviewed", "committed"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_SOURCES = ["file_upload", "manual"] as const;
export type QuotationSource = (typeof QUOTATION_SOURCES)[number];

export const QUOTATION_ROW_STATUSES = ["needs_review", "approved", "rejected"] as const;
export type QuotationRowStatus = (typeof QUOTATION_ROW_STATUSES)[number];

export const SYNC_LOG_RUN_TYPES = ["monday_push", "monday_pull"] as const;
export type SyncLogRunType = (typeof SYNC_LOG_RUN_TYPES)[number];

// Item media types (items.media[].subfolder). Main, sides and models are
// required for a complete item; lifestyle images and video clips are
// optional and never count towards completeness. "videos" is the one
// non-image type: it takes video files only, and image-only counts
// ("no images") leave it out via IMAGE_ONLY_SUBFOLDERS.
export const IMAGE_SUBFOLDERS = ["main", "sides", "models", "lifestyle", "videos"] as const;
export type ImageSubfolder = (typeof IMAGE_SUBFOLDERS)[number];
export const IMAGE_ONLY_SUBFOLDERS = ["main", "sides", "models", "lifestyle"] as const;

// Marketplaces that get their own tailored product description on the item
// detail page. Each is hand-written for now; a later AI pass generates a
// draft from the item's general title/description that a human then edits
// in place.
export const DESCRIPTION_PLATFORMS = ["macys", "kohls", "shopify", "target", "ruelala", "belk"] as const;
export type DescriptionPlatform = (typeof DESCRIPTION_PLATFORMS)[number];

// What a pending LoginOtp document is proving, beyond a plain sign-in:
//   login           - the existing two-step credentials sign-in.
//   change_password - a user changing their own password (Settings).
//   admin_reset     - an administrator resetting a DIFFERENT user's
//                      password; the code goes to the ADMIN's own email,
//                      proving the admin's identity, not the target's.
//   change_email    - a user changing their own account email; the code
//                      goes to the NEW address, proving they control it.
export const OTP_PURPOSES = ["login", "change_password", "admin_reset", "change_email"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
