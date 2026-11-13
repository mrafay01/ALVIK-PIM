import { ROLES, type Role } from "@/lib/enums";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_CATEGORIES,
  canReceive,
  eventsForRole,
  isEnabled,
  isNotificationEvent,
} from "./events";
import { renderNotificationEmail, cleanSubject, escapeHtml } from "./email";
import {
  poStageChanged,
  quoteNeedsReview,
  itemsNeedPhotos,
  catalogConflicts,
  catalogSubmitted,
  mondaySyncFailed,
} from "./messages";
import { securityEmail } from "./security";
import { digestEmail, isoWeekKey, type DigestCounts } from "./digestEmail";

describe("notification events", () => {
  it("every event is consistent: defaults are a subset of who can receive it, category is known", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const def = NOTIFICATION_EVENTS[key];
      expect(def.roles.length).toBeGreaterThan(0);
      for (const r of def.defaultOn) expect(def.roles).toContain(r);
      for (const r of def.roles) expect(ROLES).toContain(r);
      expect(NOTIFICATION_CATEGORIES).toContain(def.category);
    }
  });

  it("every role has something to switch on", () => {
    for (const role of ROLES) expect(eventsForRole(role).length).toBeGreaterThan(0);
  });

  it("keeps the three preference keys that existed before", () => {
    expect(isNotificationEvent("poStatusChanges")).toBe(true);
    expect(isNotificationEvent("mondaySyncErrors")).toBe(true);
    expect(isNotificationEvent("weeklyDigest")).toBe(true);
    expect(isNotificationEvent("toString")).toBe(false);
  });

  it("uses the role default when nothing is saved", () => {
    expect(isEnabled("poIncoming", "warehouse_receiving", undefined)).toBe(true);
    expect(isEnabled("poIncoming", "buying_purchasing", undefined)).toBe(false);
    expect(isEnabled("weeklyDigest", "administrator", {})).toBe(false);
  });

  it("a saved choice wins over the default, from a Map or a plain object", () => {
    expect(isEnabled("poIncoming", "warehouse_receiving", { poIncoming: false })).toBe(false);
    expect(isEnabled("weeklyDigest", "photography", new Map([["weeklyDigest", true]]))).toBe(true);
  });

  it("never sends to a role that can't receive it, whatever is saved", () => {
    expect(canReceive("catalogSubmitted", "photography")).toBe(false);
    expect(isEnabled("catalogSubmitted", "photography", { catalogSubmitted: true })).toBe(false);
  });

  it("orders a role's switches by category", () => {
    const order = eventsForRole("administrator").map((e) => NOTIFICATION_CATEGORIES.indexOf(NOTIFICATION_EVENTS[e].category));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("notification email", () => {
  const base = {
    subject: "PO-1 moved",
    eyebrow: "Purchase order",
    heading: "Heading",
    intro: "Intro",
    reason: "Because.",
  };

  it("escapes every piece of text in the HTML", () => {
    const out = renderNotificationEmail({
      ...base,
      heading: "<script>alert(1)</script>",
      rows: [{ label: "Vendor", value: `Tom & "Jerry"` }],
      list: [{ text: "<b>SKU</b>" }],
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(out.html).toContain("&lt;b&gt;SKU&lt;/b&gt;");
  });

  it("drops links that aren't http(s)", () => {
    const out = renderNotificationEmail({
      ...base,
      action: { label: "Go", href: "javascript:alert(1)" },
      list: [{ text: "x", href: "javascript:alert(2)" }],
    });
    expect(out.html).not.toContain("javascript:");
  });

  it("cuts long lists with 'and N more', in HTML and text", () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ text: `SKU-${i}` }));
    const out = renderNotificationEmail({ ...base, list, listTotal: 25 });
    expect(out.html).toContain("SKU-14");
    expect(out.html).not.toContain("SKU-15");
    expect(out.html).toContain("and 10 more");
    expect(out.text).toContain("- and 10 more");
  });

  it("has a plain-text version with the reason and a settings link", () => {
    const out = renderNotificationEmail({ ...base, rows: [{ label: "Now", value: "In transit" }] });
    expect(out.text).toContain("Now: In transit");
    expect(out.text).toContain("Because.");
    expect(out.text).toContain("/settings/notifications");
  });

  it("subjects carry no line breaks", () => {
    expect(cleanSubject("a\r\nBcc: x@y.z")).toBe("a Bcc: x@y.z");
    expect(renderNotificationEmail({ ...base, subject: "x\ny" }).subject).toBe("x y · CZC PIM");
  });

  it("escapeHtml covers quotes", () => {
    expect(escapeHtml(`'"&<>`)).toBe("&#39;&quot;&amp;&lt;&gt;");
  });
});

describe("notification messages", () => {
  it("a PO stage change emails the stage, and warehouse only when stock starts moving", () => {
    const toTransit = poStageChanged({ poId: "p1", poNumber: "22906", from: "pi_confirmed", to: "in_transit", actorName: "Sam" });
    expect(toTransit.map((n) => n.event)).toEqual(["poStatusChanges", "poIncoming"]);
    expect(toTransit[0].email.subject).toBe("PO-22906 moved to In transit");
    expect(toTransit[0].email.intro).toContain("by Sam");

    // In transit → Ready to ship: still on its way, not a second "incoming" email.
    const onward = poStageChanged({ poId: "p1", poNumber: "22906", from: "in_transit", to: "ready_to_ship" });
    expect(onward.map((n) => n.event)).toEqual(["poStatusChanges"]);

    const back = poStageChanged({ poId: "p1", poNumber: "22906", from: "in_transit", to: "pi_confirmed" });
    expect(back.map((n) => n.event)).toEqual(["poStatusChanges"]);
  });

  it("carries the actor so they're left out", () => {
    expect(quoteNeedsReview({ quotationId: "q", rows: 3, flagged: 1, actorId: "u1" }).actorId).toBe("u1");
  });

  it("uses singular and plural correctly", () => {
    expect(itemsNeedPhotos({ items: [{ id: "1", sku: "A1" }], total: 1 }).email.subject).toBe("1 new item needs photos");
    expect(itemsNeedPhotos({ items: [], total: 4, poNumber: "9" }).email.subject).toBe("4 new items need photos (PO-9)");
    expect(catalogConflicts({ count: 2, items: [] }).email.subject).toBe("2 catalog conflicts to resolve");
  });

  it("links to real pages", () => {
    expect(catalogSubmitted({ item: { id: "i1", sku: "A1" } }).email.action?.href).toMatch(/\/catalog\?filter=pending$/);
    expect(mondaySyncFailed({ what: "import", failed: 2, total: 500, messages: ["a", "b"] }).email.subject).toBe(
      "Importing from Monday.com failed for 2 of 500 items"
    );
  });

  it("security emails exist for every kind", () => {
    expect(securityEmail({ kind: "password_changed" }).subject).toBe("Your password was changed");
    expect(securityEmail({ kind: "email_changed", newEmail: "new@x.com" }).intro).toContain("new@x.com");
    expect(securityEmail({ kind: "role_changed", from: "photography", to: "catalog_manager" }).rows).toEqual([
      { label: "Was", value: "Photography" },
      { label: "Now", value: "Catalog Manager" },
    ]);
  });
});

describe("weekly summary", () => {
  const zero: DigestCounts = {
    openPos: 0,
    posMovedThisWeek: 0,
    inTransit: 0,
    readyToShip: 0,
    overduePos: 0,
    quotesToReview: 0,
    unverified: 0,
    unverifiedThisWeek: 0,
    catalogItems: 0,
    catalogAddedThisWeek: 0,
    incomplete: 0,
    pendingApproval: 0,
    pendingConflicts: 0,
    noImages: 0,
    missingImages: 0,
    brokenLinks: 0,
    flaggedRows: 0,
    mondayFailuresThisWeek: 0,
  };

  it("lists what needs attention for that role only", () => {
    const c = { ...zero, quotesToReview: 3, noImages: 12, flaggedRows: 5 };
    const photo = digestEmail("photography", c);
    expect(photo.subject).toBe("Weekly summary: 1 thing needs attention");
    expect(digestEmail("administrator", c).subject).toBe("Weekly summary: 3 things need attention");
    expect(photo.list?.map((l) => l.text)).toEqual(["Items with no images: 12"]);

    const admin = digestEmail("administrator", c);
    expect(admin.list?.length).toBe(3);

    const warehouse = digestEmail("warehouse_receiving", c);
    expect(warehouse.list).toEqual([]);
    expect(warehouse.subject).toBe("Weekly summary");
  });

  it("every role gets a summary", () => {
    for (const role of ROLES as readonly Role[]) expect(digestEmail(role, zero).rows?.length).toBeGreaterThan(0);
  });

  it("ISO week keys", () => {
    expect(isoWeekKey(new Date("2026-11-16T08:00:00Z"))).toBe("2026-W47");
    expect(isoWeekKey(new Date("2027-01-01T08:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2026-01-01T08:00:00Z"))).toBe("2026-W01");
  });
});
