// Microsoft Graph client for the SharePoint image store — OAuth2 client
// credentials flow (Sites.Selected, write), verified end-to-end against
// the real "CZCPIM" site on 2026-09-01. One token per call is simplest and
// correct for this app's request volume; add caching only if profiling
// ever shows the extra round trip matters.

let cachedSiteId: string | null = null;
let cachedDriveId: string | null = null;

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("SharePoint credentials are not fully set in the environment");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`SharePoint auth failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;

  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  if (!siteUrl) throw new Error("SHAREPOINT_SITE_URL is not set");
  const url = new URL(siteUrl);

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${url.hostname}:${url.pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Resolving SharePoint site failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { id: string };
  cachedSiteId = json.id;
  return json.id;
}

async function getDriveId(token: string): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  if (process.env.SHAREPOINT_IMAGES_LIBRARY_ID) {
    cachedDriveId = process.env.SHAREPOINT_IMAGES_LIBRARY_ID;
    return cachedDriveId;
  }

  const siteId = await getSiteId(token);
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Listing SharePoint drives failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { value: { id: string; name: string }[] };
  const drive = json.value.find((d) => d.name === "Documents") ?? json.value[0];
  if (!drive) throw new Error("No document library found on the SharePoint site");

  cachedDriveId = drive.id;
  return drive.id;
}

export interface SharePointContext {
  token: string;
  driveId: string;
}

export async function getSharePointContext(): Promise<SharePointContext> {
  const token = await getAccessToken();
  const driveId = await getDriveId(token);
  return { token, driveId };
}

async function graphFetch(ctx: SharePointContext, path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${ctx.driveId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ctx.token}`, ...(init?.headers ?? {}) },
  });
  return res;
}

// Ensures /Images/{itemNumber}/Main, /Sides, /Models exist — idempotent via
// conflictBehavior: "replace" on the folder itself (Graph treats an
// existing folder of the same name as a no-op rename, not a duplicate).
export async function ensureItemFolders(ctx: SharePointContext, itemNumber: string): Promise<void> {
  const base = await graphFetch(ctx, `/root:/Images:/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: itemNumber, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
  });
  if (!base.ok && base.status !== 409) {
    throw new Error(`Creating item folder failed: ${base.status} ${await base.text()}`);
  }

  for (const subfolder of ["Main", "Sides", "Models"]) {
    const res = await graphFetch(ctx, `/root:/Images/${itemNumber}:/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: subfolder, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
    });
    if (!res.ok && res.status !== 409) {
      throw new Error(`Creating ${subfolder} subfolder failed: ${res.status} ${await res.text()}`);
    }
  }
}

export type ImageSubfolder = "Main" | "Sides" | "Models";

// Filename-suffix routing, exactly as specified in the blueprint's Image
// Storage convention: bare "{itemNumber}.jpg" -> Main, "-S{n}" -> Sides,
// "-M{n}" -> Models. Anything else is rejected rather than silently misfiled.
export function inferSubfolder(itemNumber: string, filename: string): ImageSubfolder {
  const base = filename.replace(/\.[^.]+$/, "");
  const suffix = base.slice(itemNumber.length);

  if (suffix === "") return "Main";
  if (/^-S\d+$/i.test(suffix)) return "Sides";
  if (/^-M\d+$/i.test(suffix)) return "Models";

  throw new Error(
    `Filename "${filename}" doesn't match the "{itemNumber}.jpg" / "-S{n}" / "-M{n}" convention`
  );
}

export interface UploadedImage {
  sharePointItemId: string;
  url: string;
  subfolder: "main" | "sides" | "models";
}

// Uploads one file's bytes to its inferred subfolder. Small-file upload
// (<4MB) via PUT is the Graph-recommended path for this size class; the
// resumable-session API is only needed above that and isn't wired up here.
export async function uploadItemImage(
  ctx: SharePointContext,
  itemNumber: string,
  filename: string,
  bytes: Buffer
): Promise<UploadedImage> {
  const subfolder = inferSubfolder(itemNumber, filename);
  const path = `/root:/Images/${itemNumber}/${subfolder}/${filename}:/content`;

  const res = await graphFetch(ctx, path, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`Uploading ${filename} failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { id: string; webUrl: string };
  return {
    sharePointItemId: json.id,
    url: json.webUrl,
    subfolder: subfolder.toLowerCase() as "main" | "sides" | "models",
  };
}

// Moves an item's whole /Images/{sampleSku} folder to /Images/{itemNumber}
// once the permanent SKU is assigned — the "auto-rename" job from Phase 4.
export async function renameItemFolder(
  ctx: SharePointContext,
  fromSku: string,
  toItemNumber: string
): Promise<void> {
  const lookup = await graphFetch(ctx, `/root:/Images/${fromSku}`);
  if (!lookup.ok) throw new Error(`Looking up folder "${fromSku}" failed: ${lookup.status} ${await lookup.text()}`);
  const folder = (await lookup.json()) as { id: string };

  const res = await graphFetch(ctx, `/items/${folder.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: toItemNumber }),
  });
  if (!res.ok) throw new Error(`Renaming folder failed: ${res.status} ${await res.text()}`);
}
