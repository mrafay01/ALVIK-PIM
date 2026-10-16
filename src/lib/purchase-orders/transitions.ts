import { PO_STATUSES, type PoStatus } from "@/lib/enums";
import { MONDAY_CLOSED_LABELS } from "./listState";

// The one definition of how a PO may move through the pipeline. Used by the
// PATCH API (enforcement) and by PoActions (which buttons to show), so the
// two can never disagree. Client-safe: no server imports.
//
// Mainline: send_to_vendor -> pi_confirmed_pending -> pi_confirmed ->
//           in_transit -> ready_to_ship -> shipment_received
// Side lanes before it (blueprint §5): waiting_for_sample_po applies only to
// sample orders, and most POs skip negotiating — so a sample PO may go
// straight to send_to_vendor without a forced detour through negotiating.
const FORWARD: Record<PoStatus, PoStatus[]> = {
  waiting_for_sample_po: ["negotiating", "send_to_vendor"],
  negotiating: ["send_to_vendor"],
  send_to_vendor: ["pi_confirmed_pending"],
  pi_confirmed_pending: ["pi_confirmed"],
  pi_confirmed: ["in_transit"],
  in_transit: ["ready_to_ship"],
  ready_to_ship: ["shipment_received"],
  shipment_received: [],
};

export function nextPoStatuses(from: string): PoStatus[] {
  return FORWARD[from as PoStatus] ?? [];
}

// One step back, for correcting a mis-click. Administrators only — enforced
// by the API; every move (forward or back) is recorded in statusHistory.
export function previousPoStatus(from: string): PoStatus | null {
  const i = PO_STATUSES.indexOf(from as PoStatus);
  return i > 0 ? PO_STATUSES[i - 1] : null;
}

export function isValidPoTransition(from: string, to: string, opts: { allowBack?: boolean } = {}): boolean {
  if (from === to) return true;
  if (nextPoStatuses(from).includes(to as PoStatus)) return true;
  return !!opts.allowBack && previousPoStatus(from) === to;
}

// A PO that Monday marks as Received or Canceled is finished, even though
// its stored pipeline stage is a stale default ("send_to_vendor") — the
// board label has no pipeline mapping. Advancing it would be wrong.
export function isClosedOnMonday(mondayStatusText: string | null | undefined): boolean {
  return !!mondayStatusText && MONDAY_CLOSED_LABELS.includes(mondayStatusText);
}

// Every back-office checklist field and the value that counts as done.
// Must match CHECKLIST_DONE_VALUE in src/lib/statusDisplay.ts.
export const CHECKLIST_DONE: Record<string, string> = {
  images: "received",
  data: "received",
  pricing: "confirmed",
  jmUpdate: "updated",
  onMaster: "done",
  descriptions: "done",
};

export function incompleteChecklistFields(checklist: Record<string, unknown> | null | undefined): string[] {
  return Object.entries(CHECKLIST_DONE)
    .filter(([field, done]) => checklist?.[field] !== done)
    .map(([field]) => field);
}
