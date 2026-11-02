// Microsoft Graph client for the SharePoint image store — OAuth2 client
// credentials flow (Sites.Selected, write), verified end-to-end against
// the real "CZCPIM" site on 2026-09-01. The access token is cached per
// server instance until shortly before it expires, so an upload doesn't
// pay an extra Microsoft login round trip every time.

let cachedSiteId: string | null = null;
let cachedDriveId: string | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

// Encodes each segment of a drive path, so names with spaces, "#", "%"
// or "?" reach Graph intact instead of breaking the request URL.
function drivePath(...segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join("/");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

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
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`SharePoint auth failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  // Refresh five minutes early so a token never expires mid-request.
  const lifetimeMs = Math.max(0, ((json.expires_in ?? 3600) - 300) * 1000);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + lifetimeMs };
  return json.access_token;
}

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;

  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  if (!siteUrl) throw new Error("SHAREPOINT_SITE_URL is not set");
  const url = new URL(siteUrl);

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${url.hostname}:${url.pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
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
    signal: AbortSignal.timeout(30_000),
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

// Every Graph call gets a timeout unless the caller sets its own signal, so
// a stalled SharePoint request can't hold a page or batch indefinitely.
const GRAPH_TIMEOUT_MS = 60_000;

async function graphFetch(ctx: SharePointContext, path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${ctx.driveId}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${ctx.token}`, ...(init?.headers ?? {}) },
  });
  return res;
}

// Creates one folder under `parent` if it isn't there yet. conflictBehavior
// "fail" plus treating 409 as "already exists" is the safe idempotent form:
// "replace" on a folder that already holds files can swap it for an empty one.
async function ensureChildFolder(ctx: SharePointContext, parent: string[], name: string): Promise<void> {
  const where = parent.length ? `/root:/${drivePath(...parent)}:/children` : `/root/children`;
  const res = await graphFetch(ctx, where, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Creating folder "${[...parent, name].join("/")}" failed: ${res.status} ${await res.text()}`);
  }
}

// Ensures every folder along `segments` exists (e.g. ["Purchase Orders",
// "22906"]) and returns the last one.
export async function ensureFolderPath(ctx: SharePointContext, segments: string[]): Promise<DriveItem> {
  for (let i = 0; i < segments.length; i++) {
    await ensureChildFolder(ctx, segments.slice(0, i), segments[i]);
  }
  return getDriveItemByPath(ctx, segments);
}

// Item images: Images/{itemNumber}/Main, /Sides, /Models (required) and
// /Lifestyle (optional, so it's only created once a lifestyle image is
// uploaded; pass `also`).
const REQUIRED_IMAGE_FOLDERS = ["Main", "Sides", "Models"] as const;

export async function ensureItemFolders(
  ctx: SharePointContext,
  itemNumber: string,
  also?: ImageSubfolder
): Promise<void> {
  await ensureFolderPath(ctx, ["Images", itemNumber]);
  const folders = new Set<string>([...REQUIRED_IMAGE_FOLDERS, ...(also ? [also] : [])]);
  await Promise.all([...folders].map((subfolder) => ensureChildFolder(ctx, ["Images", itemNumber], subfolder)));
}

export type ImageSubfolder = "Main" | "Sides" | "Models" | "Lifestyle";

// Filename-suffix routing, as in the blueprint's Image Storage convention:
// bare "{itemNumber}.jpg" -> Main, "-S{n}" -> Sides, "-M{n}" -> Models,
// "-LS{n}" -> Lifestyle. Anything else is rejected rather than misfiled.
export function inferSubfolder(itemNumber: string, filename: string): ImageSubfolder {
  const base = filename.replace(/\.[^.]+$/, "");
  // The name must start with this item's number; otherwise another item's
  // file (or one named "IMG_0042.jpg") would be filed under this item.
  if (base.slice(0, itemNumber.length).toLowerCase() !== itemNumber.toLowerCase()) {
    throw new Error(`Filename "${filename}" must start with the item number "${itemNumber}"`);
  }
  const suffix = base.slice(itemNumber.length);

  if (suffix === "") return "Main";
  if (/^-S\d+$/i.test(suffix)) return "Sides";
  if (/^-M\d+$/i.test(suffix)) return "Models";
  if (/^-LS\d+$/i.test(suffix)) return "Lifestyle";

  throw new Error(
    `Filename "${filename}" doesn't match the "{itemNumber}.jpg" / "-S{n}" / "-M{n}" / "-LS{n}" convention`
  );
}

// Moves an item's whole /Images/{sampleSku} folder to /Images/{itemNumber}
// once the permanent SKU is assigned — the "auto-rename" job from Phase 4.
export async function renameItemFolder(
  ctx: SharePointContext,
  fromSku: string,
  toItemNumber: string
): Promise<void> {
  const lookup = await graphFetch(ctx, `/root:/${drivePath("Images", fromSku)}`);
  if (!lookup.ok) throw new Error(`Looking up folder "${fromSku}" failed: ${lookup.status} ${await lookup.text()}`);
  const folder = (await lookup.json()) as { id: string };

  const res = await graphFetch(ctx, `/items/${folder.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: toItemNumber }),
  });
  if (!res.ok) throw new Error(`Renaming folder failed: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// General drive-item helpers (used by the Purchase Orders file store).

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  parentReference?: { path?: string; id?: string };
  file?: { mimeType?: string };
  folder?: { childCount: number };
}

const ITEM_FIELDS = "id,name,size,webUrl,parentReference,file,folder";

async function readItem(res: Response, what: string): Promise<DriveItem> {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DriveItem;
}

export async function getDriveItem(ctx: SharePointContext, id: string): Promise<DriveItem> {
  return readItem(await graphFetch(ctx, `/items/${encodeURIComponent(id)}?$select=${ITEM_FIELDS}`), "Reading file");
}

export async function getDriveItemByPath(ctx: SharePointContext, segments: string[]): Promise<DriveItem> {
  return readItem(
    await graphFetch(ctx, `/root:/${drivePath(...segments)}?$select=${ITEM_FIELDS}`),
    `Reading "${segments.join("/")}"`
  );
}

// The files directly inside a folder (not subfolders). A folder that doesn't
// exist yet has no files, so a 404 returns [].
export async function listFolderFiles(ctx: SharePointContext, segments: string[]): Promise<DriveItem[]> {
  const files: DriveItem[] = [];
  let res = await graphFetch(ctx, `/root:/${drivePath(...segments)}:/children?$select=${ITEM_FIELDS}&$top=200`);
  for (;;) {
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Listing "${segments.join("/")}" failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as { value: DriveItem[]; "@odata.nextLink"?: string };
    files.push(...page.value.filter((i) => i.file));
    const next = page["@odata.nextLink"];
    if (!next) return files;
    res = await fetch(next, { headers: { Authorization: `Bearer ${ctx.token}` } });
  }
}

// The folder an item sits in, relative to the drive root, e.g.
// "Purchase Orders/22906". Graph reports it as "/drive/root:/Purchase Orders/22906"
// (or "/drives/{id}/root:/..."), percent-encoded in some responses.
export function relativeFolderPath(item: DriveItem): string {
  const raw = item.parentReference?.path ?? "";
  const idx = raw.indexOf("root:");
  const rest = idx === -1 ? "" : raw.slice(idx + "root:".length).replace(/^\/+/, "");
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

// Downloads a file's bytes. Graph answers /content with a redirect to a
// short-lived pre-authenticated URL, which fetch follows.
export async function downloadDriveItem(ctx: SharePointContext, id: string, maxBytes: number): Promise<ArrayBuffer> {
  const res = await graphFetch(ctx, `/items/${encodeURIComponent(id)}/content`);
  if (!res.ok) throw new Error(`Downloading file failed: ${res.status} ${await res.text()}`);
  const tooBig = `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`;
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error(tooBig);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error(tooBig);
  return buf;
}

// Starts a resumable upload of `fileName` into `folder`. The returned
// uploadUrl is pre-authenticated (no token needed) and accepts PUTs straight
// from the browser, so large files never pass through this app's server.
// "rename" keeps an existing file with the same name (the new one becomes
// "name 1.xlsx") instead of overwriting it.
export async function createUploadSession(
  ctx: SharePointContext,
  folder: string[],
  fileName: string,
  conflictBehavior: "rename" | "replace" = "rename"
): Promise<{ uploadUrl: string; expirationDateTime: string }> {
  const res = await graphFetch(ctx, `/root:/${drivePath(...folder, fileName)}:/createUploadSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": conflictBehavior } }),
  });
  if (!res.ok) throw new Error(`Starting upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { uploadUrl: string; expirationDateTime: string };
}

// Server-side upload of a whole file (used when copying from Monday).
// Small files go in one PUT; larger ones through an upload session in
// chunks, since a single PUT is capped at 4 MB.
export async function uploadFile(
  ctx: SharePointContext,
  folder: string[],
  fileName: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<DriveItem> {
  const SIMPLE_LIMIT = 4 * 1024 * 1024;
  if (bytes.byteLength <= SIMPLE_LIMIT) {
    await ensureFolderPath(ctx, folder);
    const res = await graphFetch(
      ctx,
      `/root:/${drivePath(...folder, fileName)}:/content?@microsoft.graph.conflictBehavior=rename`,
      { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes }
    );
    return readItem(res, `Uploading ${fileName}`);
  }

  await ensureFolderPath(ctx, folder);
  const { uploadUrl } = await createUploadSession(ctx, folder, fileName);
  const CHUNK = 320 * 1024 * 16; // must be a multiple of 320 KiB
  let last: Response | null = null;
  for (let start = 0; start < bytes.byteLength; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.byteLength);
    last = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${bytes.byteLength}` },
      body: bytes.subarray(start, end),
    });
    if (!last.ok) {
      const detail = await last.text();
      await fetch(uploadUrl, { method: "DELETE" }).catch(() => undefined);
      throw new Error(`Uploading ${fileName} failed: ${last.status} ${detail}`);
    }
  }
  return readItem(last!, `Uploading ${fileName}`);
}

// Moves an item into `folder` (created if missing). "rename" avoids
// clobbering a same-named file already there.
export async function moveDriveItem(ctx: SharePointContext, id: string, folder: string[]): Promise<DriveItem> {
  const target = await ensureFolderPath(ctx, folder);
  const res = await graphFetch(
    ctx,
    `/items/${encodeURIComponent(id)}?@microsoft.graph.conflictBehavior=rename&$select=${ITEM_FIELDS}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentReference: { id: target.id } }),
    }
  );
  return readItem(res, "Moving file");
}

// Deletes an item (SharePoint keeps it in the site's recycle bin).
export async function deleteDriveItem(ctx: SharePointContext, id: string): Promise<void> {
  const res = await graphFetch(ctx, `/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Deleting file failed: ${res.status} ${await res.text()}`);
}

// Which of these drive items still exist? Uses Graph's JSON batching (20
// requests per call). Returns id -> true (exists) / false (deleted or
// moved out of reach). Ids whose check itself failed (throttling, a
// network error) are left out rather than reported as missing.
export async function checkDriveItemsExist(ctx: SharePointContext, ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: chunk.map((id, n) => ({
          id: String(n),
          method: "GET",
          url: `/drives/${ctx.driveId}/items/${encodeURIComponent(id)}?$select=id`,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Checking files failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { responses: { id: string; status: number }[] };
    for (const r of json.responses) {
      const id = chunk[Number(r.id)];
      if (r.status === 200) out.set(id, true);
      else if (r.status === 404 || r.status === 410) out.set(id, false);
    }
  }
  return out;
}
