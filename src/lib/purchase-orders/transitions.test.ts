import {
  isValidPoTransition,
  nextPoStatuses,
  previousPoStatus,
  incompleteChecklistFields,
  CHECKLIST_DONE,
  CHECKLIST_LOCKED_STATUSES,
} from "./transitions";
import { quoteStatusFor } from "@/lib/quote-import/recount";
import { stageChangedInAppSincePull } from "@/lib/monday/sync";

const h = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("PO stage rules", () => {
  it("moves forward one step on the mainline, with the two optional lanes before it", () => {
    expect(nextPoStatuses("waiting_for_sample_po")).toEqual(["negotiating", "send_to_vendor"]);
    expect(nextPoStatuses("in_transit")).toEqual(["ready_to_ship"]);
    expect(nextPoStatuses("shipment_received")).toEqual([]);
    expect(isValidPoTransition("send_to_vendor", "in_transit")).toBe(false);
  });

  it("'back' is the stage the PO actually came from", () => {
    // A sample PO that skipped Negotiating goes back to Waiting for sample PO.
    expect(previousPoStatus("send_to_vendor", h("waiting_for_sample_po", "send_to_vendor"))).toBe("waiting_for_sample_po");
    expect(previousPoStatus("send_to_vendor", h("negotiating", "send_to_vendor"))).toBe("negotiating");
    expect(previousPoStatus("in_transit", h("send_to_vendor", "pi_confirmed_pending", "pi_confirmed", "in_transit"))).toBe(
      "pi_confirmed"
    );
  });

  it("without usable history, the mainline stage before; never an optional lane", () => {
    expect(previousPoStatus("send_to_vendor")).toBeNull();
    expect(previousPoStatus("pi_confirmed_pending")).toBe("send_to_vendor");
    expect(previousPoStatus("ready_to_ship", h("send_to_vendor"))).toBe("in_transit");
    expect(previousPoStatus("waiting_for_sample_po")).toBeNull();
  });

  it("only administrators may go back, and only to that stage", () => {
    const history = h("waiting_for_sample_po", "send_to_vendor");
    expect(isValidPoTransition("send_to_vendor", "waiting_for_sample_po", { history })).toBe(false);
    expect(isValidPoTransition("send_to_vendor", "waiting_for_sample_po", { allowBack: true, history })).toBe(true);
    expect(isValidPoTransition("send_to_vendor", "negotiating", { allowBack: true, history })).toBe(false);
  });

  it("knows which checklist fields are incomplete", () => {
    expect(incompleteChecklistFields(CHECKLIST_DONE)).toEqual([]);
    expect(incompleteChecklistFields({ ...CHECKLIST_DONE, pricing: "pending" })).toEqual(["pricing"]);
    expect(incompleteChecklistFields(undefined)).toHaveLength(6);
    expect(CHECKLIST_LOCKED_STATUSES).toEqual(["ready_to_ship", "shipment_received"]);
  });
});

describe("quote status from its rows", () => {
  it("needs review while any row is undecided", () => {
    expect(quoteStatusFor({ pending: 1, approvedUncommitted: 3, committed: 5 })).toBe("needs_review");
  });
  it("reviewed when decided but approved rows wait to be committed", () => {
    expect(quoteStatusFor({ pending: 0, approvedUncommitted: 2, committed: 0 })).toBe("reviewed");
    // Committed before, then a rejected row was approved: the Commit button must come back.
    expect(quoteStatusFor({ pending: 0, approvedUncommitted: 1, committed: 4 })).toBe("reviewed");
  });
  it("committed once nothing approved is left waiting", () => {
    expect(quoteStatusFor({ pending: 0, approvedUncommitted: 0, committed: 4 })).toBe("committed");
  });
  it("an all-rejected quote is reviewed, not committed", () => {
    expect(quoteStatusFor({ pending: 0, approvedUncommitted: 0, committed: 0 })).toBe("reviewed");
  });
});

describe("Monday push: is the app's stage the truth?", () => {
  const pulled = new Date("2026-11-10T10:00:00Z");
  it("a stage change in the app after the last pull is", () => {
    expect(stageChangedInAppSincePull({ statusHistory: [{ changedAt: new Date("2026-11-11T09:00:00Z") }], lastPulledFromMondayAt: pulled })).toBe(true);
  });
  it("history older than the last pull isn't", () => {
    expect(stageChangedInAppSincePull({ statusHistory: [{ changedAt: new Date("2026-11-09T09:00:00Z") }], lastPulledFromMondayAt: pulled })).toBe(false);
  });
  it("a PO that was never pulled, with a history, is", () => {
    expect(stageChangedInAppSincePull({ statusHistory: [{ changedAt: pulled }], lastPulledFromMondayAt: null })).toBe(true);
  });
  it("no history at all isn't", () => {
    expect(stageChangedInAppSincePull({ statusHistory: [], lastPulledFromMondayAt: pulled })).toBe(false);
  });
});
