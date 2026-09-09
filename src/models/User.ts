import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ROLES } from "@/lib/enums";

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export default (models.User as Model<UserDoc>) ||
  model<UserDoc>("User", UserSchema);
