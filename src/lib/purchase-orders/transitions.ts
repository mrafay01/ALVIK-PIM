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

type HistoryEntry = { status?: string | null };

// One step back, for correcting a mis-click. Administrators only — enforced
// by the API; every move (forward or back) is recorded in statusHistory.
// "Back" is the stage the PO was actually in before this one, read from its
// history: a sample PO that went straight from Waiting for sample PO to Send
// to vendor goes back there, not to Negotiating, which it never passed.
// Without usable history (POs pulled from Monday have none), the stage
// before it on the mainline; never a side lane it may not have been in.
export function previousPoStatus(from: string, history: HistoryEntry[] = []): PoStatus | null {
  const last = history.length - 1;
  if (last >= 1 && history[last]?.status === from) {
    const prev = history[last - 1]?.status;
    if (prev && prev !== from && PO_STATUSES.includes(prev as PoStatus)) return prev as PoStatus;
  }
  for (const [stage, nexts] of Object.entries(FORWARD) as [PoStatus, PoStatus[]][]) {
    if (MAINLINE.includes(stage) && nexts.includes(from as PoStatus)) return stage;
  }
  return null;
}

// The main pipeline, without the two optional lanes before it.
const MAINLINE: PoStatus[] = [
  "send_to_vendor",
  "pi_confirmed_pending",
  "pi_confirmed",
  "in_transit",
  "ready_to_ship",
  "shipment_received",
];

export function isValidPoTransition(
  from: string,
  to: string,
  opts: { allowBack?: boolean; history?: HistoryEntry[] } = {}
): boolean {
  if (from === to) return true;
  if (nextPoStatuses(from).includes(to as PoStatus)) return true;
  return !!opts.allowBack && previousPoStatus(from, opts.history) === to;
}

// Stages at which the whole back-office checklist must stay complete: a PO
// can't reach Ready to ship without it, so it can't lose it there either.
export const CHECKLIST_LOCKED_STATUSES: readonly PoStatus[] = ["ready_to_ship", "shipment_received"];

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
