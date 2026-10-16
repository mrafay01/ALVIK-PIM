import mongoose from "mongoose";
import path from "path";
import { readdir } from "fs/promises";
import { pathToFileURL } from "url";
import { connectDB } from "@/lib/db";
import Migration from "@/models/Migration";

// Migration runner.
//
// Each file in src/scripts/migrations/*.ts exports:
//   export const name = "2026-10-12-backfill-base-sku";
//   export const note?: string;
//   export async function up(db: typeof mongoose): Promise<void>;
//
// Files are sorted lexically — prefix each with an ISO date so order
// matches creation. The runner atomically acquires a lock document, runs
// each un-applied migration in order, records the ledger entry, then
// releases the lock. Two deploys racing the same migration cleanly
// serialize behind the lock rather than both running the same `up`.
//
// Run with:  npm run migrate

type Migration = {
  name: string;
  note?: string;
  up: (db: typeof mongoose) => Promise<void>;
};

const LOCK_KEY = "__migration_runner_lock__";
const LOCK_TTL_MS = 10 * 60 * 1000;

async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const result = await Migration.updateOne(
    {
      name: LOCK_KEY,
      $or: [{ appliedAt: { $lt: new Date(now.getTime() - LOCK_TTL_MS) } }, { appliedAt: null }],
    },
    { $set: { name: LOCK_KEY, appliedAt: now, note: "runner lock" } },
    { upsert: true }
  ).catch(async () => {
    // Upsert can collide on the unique name index if two runners race;
    // the loser's op errors cleanly and reports lock-not-acquired.
    return { modifiedCount: 0, upsertedCount: 0 } as never;
  });
  return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0) > 0;
}

async function releaseLock(): Promise<void> {
  await Migration.deleteOne({ name: LOCK_KEY });
}

async function loadMigrations(): Promise<Migration[]> {
  const dir = path.join(process.cwd(), "src", "scripts", "migrations");
  const files = await readdir(dir).catch(() => [] as string[]);
  const scripts: Migration[] = [];
  for (const f of files.sort()) {
    if (!f.endsWith(".ts") && !f.endsWith(".js")) continue;
    const mod = (await import(pathToFileURL(path.join(dir, f)).href)) as Partial<Migration>;
    if (typeof mod.name !== "string" || typeof mod.up !== "function") {
      throw new Error(`${f}: must export \`name: string\` and \`up(db)\`.`);
    }
    scripts.push({ name: mod.name, note: mod.note, up: mod.up });
  }
  return scripts;
}

async function main(): Promise<void> {
  await connectDB();
  if (!(await acquireLock())) {
    console.error("Another migration runner is in progress. Exiting.");
    process.exit(2);
  }

  try {
    const scripts = await loadMigrations();
    const applied = new Set(
      (await Migration.find({ name: { $ne: LOCK_KEY } }).select("name").lean()).map((m) => m.name)
    );
    const pending = scripts.filter((s) => !applied.has(s.name));
    if (pending.length === 0) {
      console.log("No pending migrations. Up to date.");
      return;
    }
    console.log(`Pending: ${pending.length}`);
    for (const script of pending) {
      const start = Date.now();
      console.log(`→ ${script.name}`);
      await script.up(mongoose);
      await Migration.create({ name: script.name, note: script.note ?? null });
      console.log(`  ok (${Date.now() - start}ms)`);
    }
  } finally {
    await releaseLock();
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await releaseLock().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
