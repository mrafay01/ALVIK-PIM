// Real board/column IDs, captured 2026-09-01 from the token Joel supplied.
// The "Purchase Orders" board's real Status column has ~25 labels — richer
// than this app's 8-value PoStatus enum (it also carries side-lane/error
// states like "Stuck", "Partial received", "Sent back to vendor" that the
// app doesn't model as first-class statuses). STATUS_TO_MONDAY_LABEL is
// deliberately one-directional and lossy in that direction only: every app
// status maps to exactly one board label, but not every board label maps
// back to an app status — see MONDAY_LABEL_TO_STATUS below, which only
// covers labels close enough not to need a decision, and unmapped push logs
// a note that the person accepted the label and it fell where it fell.
import type { PoStatus } from "@/lib/enums";

export const MONDAY_BOARD_ID = "18426525705"; // "test by joel Purchase Orders"

export const MONDAY_COLUMN_IDS = {
  status: "status",
  vendor: "dropdown1",
  poTotal: "numbers",
  orderDate: "date4",
  requestDate: "date",
  vendorConfDate: "date_1",
  priority: "priority",
  images: "status_1",
  data: "status_11",
  pricing: "status_12",
  jmUpdate: "status_10",
  onMaster: "status_110",
  descriptions: "status_13",
  trackingNumber: "tracking_",
  joelShipConfirmed: "joel_conf_to_ship",
} as const;

// App status -> the board's Status-column label to write on push.
export const STATUS_TO_MONDAY_LABEL: Record<PoStatus, string> = {
  waiting_for_sample_po: "Waiting for sample PO",
  negotiating: "Send to vendor", // board has no distinct "Negotiating" label; closest real state
  send_to_vendor: "Send to vendor",
  pi_confirmed_pending: "PI Confirmed pending",
  pi_confirmed: "PI Confirmed",
  in_transit: "In transit",
  ready_to_ship: "Ready to ship",
  shipment_received: "Shipment Received",
};

// Board label -> app status, for reading inbound webhook/manual overrides.
// Only labels with an unambiguous app-side equivalent are listed; anything
// else (Stuck, Partial received, Canceled, etc.) is intentionally omitted
// so it's treated as "no confident mapping" rather than guessed.
export const MONDAY_LABEL_TO_STATUS: Record<string, PoStatus> = {
  "Send to vendor": "send_to_vendor",
  "PI Confirmed pending": "pi_confirmed_pending",
  "PI Confirmed": "pi_confirmed",
  "In transit": "in_transit",
  "Ready to ship": "ready_to_ship",
  "Shipment Received": "shipment_received",
  "Waiting for sample PO": "waiting_for_sample_po",
};

const BACK_OFFICE_LABEL_MAP: Record<string, Record<string, string>> = {
  images: { pending: "Sent to photo guy", sent_to_photo_guy: "Sent to photo guy", rush_requested: "Rush 1pcs for photo guy", modify_requested: "Modify image", received: "Received" },
  data: { pending: "Waiting for vendor update", received: "Received", waiting_for_vendor_update: "Waiting for vendor update" },
  pricing: { pending: "Negotiating", confirmed: "Confirmed" },
  jmUpdate: { pending: "Working on it", waiting_for_price: "Waiting for Jm price", waiting_for_box_number: "Waiting for Box#", updated: "Updated" },
  onMaster: { pending: "Need to enter it", need_msrp: "Need MSRP Prices", done: "Done" },
  descriptions: { pending: "in-progress", waiting_for_more_items: "waiting for more items", done: "Done" },
};

export function backOfficeFieldToMondayLabel(field: keyof typeof BACK_OFFICE_LABEL_MAP, value: string): string | null {
  return BACK_OFFICE_LABEL_MAP[field]?.[value] ?? null;
}
