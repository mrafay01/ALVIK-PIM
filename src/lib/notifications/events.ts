import type { Role } from "@/lib/enums";

// Every email the app can send about something that happened, who can get
// it, and who gets it unless they turn it off (Settings → Notifications).
//
// The key is also the user's preference key (users.notificationPrefs), so
// the three keys that existed before this list (poStatusChanges,
// mondaySyncErrors, weeklyDigest) keep the choices people already saved.
// Only a user's own changes are stored; anything missing uses the default
// for their role.
//
// Security emails (password, email or role changed) are not in this list:
// they always go out and can't be turned off. See lib/notifications/security.ts.
//
// Pure data: safe to import from client components.

export const NOTIFICATION_CATEGORIES = [
  "Purchase orders",
  "Quotes and new items",
  "Images",
  "Catalog",
  "Monday.com",
  "Summary",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationEventDef = {
  label: string;
  helper: string;
  category: NotificationCategory;
  // Roles that can receive it (and see the switch in Settings).
  roles: readonly Role[];
  // Roles that get it until they turn it off.
  defaultOn: readonly Role[];
};

const ALL_ROLES: readonly Role[] = [
  "administrator", "developer",
  "buyer_merchandiser",
  "buying_purchasing",
  "warehouse_receiving",
  "photography",
  "catalog_manager",
  "viewer",
];

export const NOTIFICATION_EVENTS = {
  poStatusChanges: {
    label: "A purchase order moves to a new stage",
    helper: "When someone moves a PO along the pipeline in the app, for example from PI Confirmed to In transit.",
    category: "Purchase orders",
    roles: ["buying_purchasing", "buyer_merchandiser", "catalog_manager", "administrator", "developer"],
    defaultOn: ["buying_purchasing", "buyer_merchandiser"],
  },
  poIncoming: {
    label: "A shipment is on its way",
    helper: "When a PO is marked In transit or Ready to ship, so the warehouse knows stock is coming.",
    category: "Purchase orders",
    roles: ["warehouse_receiving", "buying_purchasing", "administrator", "developer"],
    defaultOn: ["warehouse_receiving"],
  },
  quoteNeedsReview: {
    label: "A vendor quote is waiting for review",
    helper: "When a vendor PI is uploaded or a quote is entered by hand and needs checking before it's committed.",
    category: "Quotes and new items",
    roles: ["buyer_merchandiser", "buying_purchasing", "administrator", "developer"],
    defaultOn: ["buyer_merchandiser", "buying_purchasing"],
  },
  quoteCommitted: {
    label: "A quote is committed",
    helper: "When a quote's items are added to Un-Verified Items and its purchase order is created or updated.",
    category: "Quotes and new items",
    roles: ["buyer_merchandiser", "buying_purchasing", "catalog_manager", "administrator", "developer"],
    defaultOn: ["catalog_manager"],
  },
  itemsNeedPhotos: {
    label: "New items need photos",
    helper: "When a committed quote adds new items that don't have any images yet.",
    category: "Images",
    roles: ["photography", "buying_purchasing", "administrator", "developer"],
    defaultOn: ["photography"],
  },
  imagesComplete: {
    label: "An item's photos are complete",
    helper: "When an item gets its last required photo (main, side and model), so it can be submitted to the catalog.",
    category: "Images",
    roles: ["catalog_manager", "photography", "administrator", "developer"],
    defaultOn: ["catalog_manager"],
  },
  catalogConflicts: {
    label: "A vendor PI disagrees with the catalog",
    helper: "When a committed quote has a weight, size or vendor SKU that differs from the catalog item, and a person has to decide.",
    category: "Catalog",
    roles: ["catalog_manager", "administrator", "developer"],
    defaultOn: ["catalog_manager", "administrator", "developer"],
  },
  catalogSubmitted: {
    label: "An item is waiting for catalog approval",
    helper: "When someone submits an item to the catalog and it needs an administrator to approve it.",
    category: "Catalog",
    roles: ["administrator", "developer"],
    defaultOn: ["administrator", "developer"],
  },
  catalogApproved: {
    label: "An item is approved into the catalog",
    helper: "When an administrator approves an item that was submitted to the catalog.",
    category: "Catalog",
    roles: ["catalog_manager", "buyer_merchandiser", "administrator", "developer"],
    defaultOn: ["catalog_manager"],
  },
  mondaySyncErrors: {
    label: "A Monday.com import or update fails",
    helper: "When importing from the Monday board, or sending a PO's status to it, fails for one or more POs.",
    category: "Monday.com",
    roles: ["administrator", "developer", "buying_purchasing"],
    defaultOn: ["administrator", "developer", "buying_purchasing"],
  },
  weeklyDigest: {
    label: "Weekly summary",
    helper: "Every Monday morning: what needs attention in your part of the app, and what changed in the last 7 days.",
    category: "Summary",
    roles: ALL_ROLES,
    defaultOn: [],
  },
} as const satisfies Record<string, NotificationEventDef>;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export const NOTIFICATION_EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];

export function isNotificationEvent(key: string): key is NotificationEvent {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, key);
}

export function canReceive(event: NotificationEvent, role: Role): boolean {
  return (NOTIFICATION_EVENTS[event].roles as readonly Role[]).includes(role);
}

// What a user's stored preferences look like once read: a Mongoose Map on a
// document, a plain object on a .lean() read, or nothing at all.
export type StoredPrefs = Map<string, unknown> | Record<string, unknown> | null | undefined;

function storedValue(prefs: StoredPrefs, key: string): unknown {
  if (!prefs) return undefined;
  return prefs instanceof Map ? prefs.get(key) : prefs[key];
}

// Does this user get this email? Their own choice if they made one,
// otherwise their role's default. Never for a role that can't receive it.
export function isEnabled(event: NotificationEvent, role: Role, prefs: StoredPrefs): boolean {
  if (!canReceive(event, role)) return false;
  const v = storedValue(prefs, event);
  if (typeof v === "boolean") return v;
  return (NOTIFICATION_EVENTS[event].defaultOn as readonly Role[]).includes(role);
}

// The switches one role sees in Settings, in category order.
export function eventsForRole(role: Role): NotificationEvent[] {
  const order = new Map(NOTIFICATION_CATEGORIES.map((c, i) => [c, i]));
  return NOTIFICATION_EVENT_KEYS.filter((e) => canReceive(e, role)).sort(
    (a, b) => order.get(NOTIFICATION_EVENTS[a].category)! - order.get(NOTIFICATION_EVENTS[b].category)!
  );
}
