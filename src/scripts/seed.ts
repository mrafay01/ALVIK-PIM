/**
 * Seeds one user per role and the vendor directory from the confirmed
 * Monday.com vendor list. Safe to re-run — skips anything that already
 * exists by email/name rather than duplicating.
 *
 * Run with: npx tsx --env-file=.env.local src/scripts/seed.ts
 */
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import User from "@/models/User";
import Vendor from "@/models/Vendor";
import { ROLES, type Role } from "@/lib/enums";

const ROLE_SEED_USERS: { role: Role; name: string; emailLocalPart: string }[] = [
  { role: "administrator", name: "Admin", emailLocalPart: "admin" },
  { role: "buyer_merchandiser", name: "Buyer Merchandiser", emailLocalPart: "buyer" },
  { role: "buying_purchasing", name: "Buying Purchasing", emailLocalPart: "purchasing" },
  { role: "warehouse_receiving", name: "Warehouse Receiving", emailLocalPart: "warehouse" },
  { role: "photography", name: "Photography", emailLocalPart: "photography" },
  { role: "catalog_manager", name: "Catalog Manager", emailLocalPart: "catalog" },
  { role: "developer", name: "Developer", emailLocalPart: "developer" },
  { role: "viewer", name: "Viewer", emailLocalPart: "viewer" },
];

// Vendor names confirmed from the real Monday.com board exports (§5 of the
// blueprint) — not placeholders. paymentTermsDays is left null for all;
// nobody has supplied real per-vendor terms yet.
const VENDOR_NAMES = [
  "Eshine",
  "Kirin",
  "Sunny",
  "Sam Pearl",
  "Rose",
  "Beretta",
  "Rachel",
  "Landy Jew",
  "China Silver",
  "Ying Xin Silver",
  "Olia",
  "Anfook",
  "Artful",
  "Longlong",
  "Yusheng",
  "Zuck",
  "Langtong",
  "RMW",
  "ACPL",
  "Feyfine",
  "Qingdao",
  "Diya",
  "Odisha",
  "DancingDream Jew",
  "ACME",
  "Mogo",
];

async function seedUsers(domain: string) {
  let created = 0;
  for (const u of ROLE_SEED_USERS) {
    const email = `${u.emailLocalPart}@${domain}`;
    const existing = await User.findOne({ email });
    if (existing) continue;

    const passwordHash = await bcrypt.hash(cryptoRandomPassword(), 12);
    await User.create({
      name: u.name,
      email,
      passwordHash,
      role: u.role,
      active: true,
    });
    logger.info(`Created user for role ${u.role}`, { email });
    created += 1;
  }
  return created;
}

async function seedVendors() {
  let created = 0;
  for (const name of VENDOR_NAMES) {
    const existing = await Vendor.findOne({ name });
    if (existing) continue;
    await Vendor.create({ name });
    created += 1;
  }
  return created;
}

function cryptoRandomPassword(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function main() {
  const domain = process.env.SEED_DOMAIN ?? "example.com";
  await connectDB();

  const roleCheck = ROLE_SEED_USERS.map((u) => u.role);
  const missing = ROLES.filter((r) => !roleCheck.includes(r));
  if (missing.length > 0) {
    logger.error(`ROLE_SEED_USERS is missing coverage for: ${missing.join(", ")}`);
    process.exit(1);
  }

  const usersCreated = await seedUsers(domain);
  const vendorsCreated = await seedVendors();

  logger.info("Database seeding complete", { usersCreated, vendorsCreated });
  process.exit(0);
}

main().catch((err) => {
  logger.error("Seed script failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
