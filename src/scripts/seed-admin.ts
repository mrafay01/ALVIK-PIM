/**
 * One-time setup: creates the first administrator account.
 * Run with: npx tsx src/scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import User from "@/models/User";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    logger.error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars required");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    logger.info("Administrator already exists, skipping creation", { email });
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

  logger.info("Administrator account created", { email, name });
  process.exit(0);
}

main().catch((err) => {
  logger.error("Seed-admin script failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
