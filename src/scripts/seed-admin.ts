/**
 * One-time setup: creates the first administrator account.
 * Run with: npx tsx src/scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running.");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`User ${email} already exists — skipping.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: "administrator",
    active: true,
  });

  console.log(`Created administrator: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
