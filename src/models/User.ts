import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ROLES } from "@/lib/enums";


const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
    // Email notification choices, edited from Settings → Notifications:
    // event key (lib/notifications/events.ts) → on/off. Only a user's own
    // changes are stored; a missing key means their role's default.
    notificationPrefs: { type: Map, of: Boolean, default: undefined },
    // Bumped by "Sign out of all other devices" (Settings > Security).
    // Stamped into every JWT at sign-in (see auth.ts's jwt callback); the
    // session callback rejects a token whose stamped version doesn't match
    // the current value here, which is what actually invalidates every
    // previously-issued token without a server-side session store — NextAuth
    // runs on stateless JWTs, so there's nothing else to revoke directly.
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export default (models.User as Model<UserDoc>) ||
  model<UserDoc>("User", UserSchema);
