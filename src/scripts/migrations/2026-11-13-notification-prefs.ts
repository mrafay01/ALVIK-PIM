import type mongoose from "mongoose";

// Notifications became real emails on 2026-11-13, with defaults per role
// (lib/notifications/events.ts). Until then every user got the same three
// switches saved on their account by a schema default
// (poStatusChanges: true, mondaySyncErrors: true, weeklyDigest: false)
// although nothing was sent and the screen said so. Those saved values
// would now override the role defaults, e.g. sending every administrator
// every PO-stage email.
//
// This removes the saved preferences of users who never changed them (all
// three still at the old defaults, or none saved), so their role's
// defaults apply. Anyone who did change a switch keeps their choices.
// Uses the native collection: the schema now stores a Map.
export const name = "2026-11-13-notification-prefs";
export const note = "Clear never-changed notification preferences so role defaults apply";

export async function up(db: typeof mongoose): Promise<void> {
  const users = db.connection.db!.collection("users");
  const untouched = {
    $or: [
      { notificationPrefs: {} },
      { notificationPrefs: null },
      {
        "notificationPrefs.poStatusChanges": { $in: [true, null] },
        "notificationPrefs.mondaySyncErrors": { $in: [true, null] },
        "notificationPrefs.weeklyDigest": { $in: [false, null] },
        $expr: {
          $lte: [{ $size: { $objectToArray: { $ifNull: ["$notificationPrefs", {}] } } }, 3],
        },
      },
    ],
  };
  const r = await users.updateMany(
    { notificationPrefs: { $exists: true }, ...untouched },
    { $unset: { notificationPrefs: "" } }
  );
  console.log(`  users: cleared never-changed notification preferences on ${r.modifiedCount} user(s)`);
}
