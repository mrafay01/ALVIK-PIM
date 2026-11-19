import type { Role } from "@/lib/enums";
import { appUrl, type EmailRow, type EmailListItem } from "./email";
import type { NotifyInput } from "./notify";

// The weekly summary's wording: which lines each role sees and what the
// email says. Pure (no database), so it's unit-tested; the counts come
// from loadDigestCounts in ./digest.

export type DigestCounts = {
  openPos: number;
  posMovedThisWeek: number;
  inTransit: number;
  readyToShip: number;
  overduePos: number;
  quotesToReview: number;
  unverified: number;
  unverifiedThisWeek: number;
  catalogItems: number;
  catalogAddedThisWeek: number;
  incomplete: number;
  pendingApproval: number;
  pendingConflicts: number;
  noImages: number;
  missingImages: number;
  brokenLinks: number;
  flaggedRows: number;
  mondayFailuresThisWeek: number;
};

type Line = { label: string; value: number; href: string; attention?: boolean };

// The lines each role sees, in order. Administrators see every line.
function linesFor(role: Role, c: DigestCounts): Line[] {
  const po: Line[] = [
    { label: "Open purchase orders", value: c.openPos, href: "/purchase-orders" },
    { label: "POs that moved stage this week", value: c.posMovedThisWeek, href: "/purchase-orders" },
    { label: "Open POs past their request date", value: c.overduePos, href: "/purchase-orders", attention: true },
  ];
  const quotes: Line[] = [
    { label: "Vendor quotes waiting for review", value: c.quotesToReview, href: "/purchase-orders/quotes", attention: true },
  ];
  const incoming: Line[] = [
    { label: "POs in transit", value: c.inTransit, href: "/purchase-orders" },
    { label: "POs ready to ship", value: c.readyToShip, href: "/purchase-orders" },
  ];
  const items: Line[] = [
    { label: "Un-verified items", value: c.unverified, href: "/items" },
    { label: "New un-verified items this week", value: c.unverifiedThisWeek, href: "/items" },
  ];
  const catalog: Line[] = [
    { label: "Catalog items", value: c.catalogItems, href: "/catalog" },
    { label: "Added to the catalog this week", value: c.catalogAddedThisWeek, href: "/catalog" },
    { label: "Catalog items with a record to complete", value: c.incomplete, href: "/catalog?filter=incomplete" },
    { label: "PI conflicts to resolve", value: c.pendingConflicts, href: "/catalog/conflicts", attention: true },
  ];
  const approvals: Line[] = [
    { label: "Items waiting for catalog approval", value: c.pendingApproval, href: "/catalog?filter=pending", attention: true },
  ];
  const images: Line[] = [
    { label: "Items with no images", value: c.noImages, href: "/images?status=none", attention: true },
    { label: "Items missing a main, side or model image", value: c.missingImages, href: "/images?status=missing" },
    { label: "Broken image links", value: c.brokenLinks, href: "/images?status=broken", attention: true },
  ];
  const admin: Line[] = [
    { label: "Master File rows in Flagged Items", value: c.flaggedRows, href: "/catalog/flagged", attention: true },
    { label: "Monday.com runs with failures this week", value: c.mondayFailuresThisWeek, href: "/admin/monday-pull", attention: true },
  ];
  switch (role) {
    case "administrator":
    case "developer":
      return [...po, ...quotes, ...incoming, ...items, ...catalog, ...approvals, ...images, ...admin];
    case "buying_purchasing":
      return [...po, ...quotes, ...incoming, ...items, ...images];
    case "buyer_merchandiser":
      return [...po, ...quotes, ...items];
    case "warehouse_receiving":
      return [...incoming, { label: "Open purchase orders", value: c.openPos, href: "/purchase-orders" }];
    case "photography":
      return [...images, { label: "New un-verified items this week", value: c.unverifiedThisWeek, href: "/items" }];
    case "catalog_manager":
      return [...items, ...catalog, ...images.slice(0, 2)];
    case "viewer":
      return [...po, ...quotes, ...incoming, ...items, ...catalog, ...images];
  }
}

export function digestEmail(role: Role, c: DigestCounts): NotifyInput["email"] {
  const lines = linesFor(role, c);
  const todo = lines.filter((l) => l.attention && l.value > 0);
  const rows: EmailRow[] = lines.map((l) => ({ label: l.label, value: l.value.toLocaleString("en-US") }));
  const list: EmailListItem[] = todo.map((l) => ({ text: `${l.label}: ${l.value.toLocaleString("en-US")}`, href: appUrl(l.href) }));
  return {
    subject:
      todo.length > 0
        ? `Weekly summary: ${todo.length} ${todo.length === 1 ? "thing needs" : "things need"} attention`
        : "Weekly summary",
    eyebrow: "Weekly summary",
    heading: "Your week in Alvik PIM",
    intro:
      todo.length > 0
        ? "Here's where things stand. The items in the list below are waiting on someone; each one opens the right page."
        : "Here's where things stand. Nothing in your area is waiting on anyone right now.",
    rows,
    list,
    action: { label: "Open the dashboard", href: appUrl("/dashboard") },
  };
}

// ISO week key, e.g. "2026-W46": the digest goes out at most once per week.
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
