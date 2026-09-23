import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ROLES } from "@/lib/enums";

// Per-user notification preferences, edited from Settings > Notifications.
// Every field defaults to on so existing users keep today's behavior (none
// of this is wired to an actual notifier yet — these are the toggles a
// future email/in-app notification job will read) without a migration.
const NotificationPrefsSchema = new Schema(
  {
    poStatusChanges: { type: Boolean, default: true },
    mondaySyncErrors: { type: Boolean, default: true },
    paymentDue: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export default (models.User as Model<UserDoc>) ||
  model<UserDoc>("User", UserSchema);
