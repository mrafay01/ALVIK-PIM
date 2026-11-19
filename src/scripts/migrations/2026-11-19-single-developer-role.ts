import User from "@/models/User";

// The new "developer" role is limited to one account by a partial unique
// index on users.role. Nothing is changed in the data; this only builds the
// index (syncIndexes also leaves the existing indexes as they are).
export const name = "2026-11-19-single-developer-role";
export const note = "Add the unique index that allows only one developer user";

export async function up(): Promise<void> {
  await User.syncIndexes();
  console.log("  users: indexes in sync (one developer allowed)");
}
