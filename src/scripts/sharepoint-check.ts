/**
 * Read-only SharePoint health check, run as the app's own identity (the
 * credentials in .env.local), so it works even if your personal Microsoft
 * account can't open the CZCPIM site. Changes nothing.
 *
 * Run with: npm run sharepoint:check
 */
import { getSharePointContext } from "@/lib/sharepoint/client";

type DriveItem = { id: string; name: string; size?: number; folder?: { childCount: number }; lastModifiedDateTime?: string };

async function main() {
  console.log("SharePoint check (read-only)\n");

  let ctx;
  try {
    ctx = await getSharePointContext();
  } catch (err) {
    console.log("✗ Could not connect:", (err as Error).message.split("\n")[0]);
    console.log("  Check the SHAREPOINT_* values in .env.local (the client secret may have expired).");
    process.exit(1);
  }
  console.log("✓ Logged in to Microsoft as the app");
  console.log("✓ Connected to site:", process.env.SHAREPOINT_SITE_URL);

  const list = async (path: string): Promise<DriveItem[] | null> => {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${ctx.driveId}/root:/${path}:/children?$top=999&$select=id,name,size,folder,lastModifiedDateTime`,
      { headers: { Authorization: `Bearer ${ctx.token}` } }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return ((await res.json()) as { value: DriveItem[] }).value;
  };

  const items = await list("Images");
  if (!items) {
    console.log("\n! No 'Images' folder yet. It's created automatically on the first upload.");
    return;
  }
  const folders = items.filter((i) => i.folder);
  console.log(`✓ 'Images' folder found: ${folders.length} item folder(s)\n`);
  if (folders.length === 0) {
    console.log("  No images uploaded yet. Upload one from an item's page in the app, then run this again.");
    return;
  }

  for (const f of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${f.name}`);
    for (const sub of ["Main", "Sides", "Models", "Lifestyle"]) {
      const files = (await list(`Images/${f.name}/${sub}`)) ?? [];
      const names = files.filter((x) => !x.folder).map((x) => `${x.name} (${Math.round((x.size ?? 0) / 1024)} KB)`);
      console.log(`    ${names.length ? "✓" : "·"} ${sub.padEnd(9)} ${names.length ? names.join(", ") : "empty"}`);
    }
  }
}

main().catch((err) => {
  console.error("✗ Check failed:", (err as Error).message);
  process.exit(1);
});
