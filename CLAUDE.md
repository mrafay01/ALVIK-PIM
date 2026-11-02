# CZC PIM — project guide

Product information + purchase-order system for **CZ Collections** (jewelry). It replaces the
old Master File spreadsheet and per-vendor PI sheets with one app, while Monday.com stays the team's
CRM / Kanban. Next.js 15 (App Router) + MongoDB (Mongoose) + Microsoft SharePoint (files) +
Monday.com API. Target hosting: **Vercel (serverless)**.

Living blueprint (architecture, schema, decisions, history):
https://claude.ai/artifact/APHSSNFBsgt1SFvj8wyzxk — update it when behaviour or the data model changes.
Older docs in the repo: `PROJECT-REPORT.md`, `GETTING-STARTED-PRODUCTION.md` (the blueprint is newer).

---

## 1. What the app is for (the business rules that shape everything)

- **The catalog is the single source of truth** for products. The Master File import and hand-added
  catalog items go straight into it; everything else must be verified first.
- **Monday.com stays the CRM** (vendor chat, photo requests, sample threads). The app reads the PO
  board on demand ("Monday import") and pushes PO status back, but never treats Monday as
  authoritative for stored product values and never writes chat. No in-app CRM, no street-sighting /
  idea-first intake — the pipeline starts when a real vendor PI exists.
- **New vendor PIs are checked against the catalog.** If a PI disagrees with a catalog item on an
  authoritative field (weights, sizes/measurements, vendor SKU), the catalog value is kept and a
  **conflict** is raised for a human (Catalog → Conflicts). Non-authoritative fields and pricing merge.
- **SharePoint holds every file**: item images (`Images/{sku}/Main|Sides|Models`, plus optional
  `Lifestyle`) and every PO document (`Purchase Orders/{poNumber}/`, e.g. `Purchase Orders/22906/`,
  including the files copied from Monday). MongoDB stores only ids, names and links, never bytes.
- **One order is one PO**, keyed by the bare PO number Monday uses (`22906`); "PO-22906" is only a
  label on screen.
- **Payables / payments are out of scope** (they live in Jm, a third-party app, and Monday).
  Removed 2026-10-13 — don't reintroduce.

## 2. Commands

```bash
yarn dev / npm run dev      # dev server on :3000 (the user runs `yarn dev`)
npm run typecheck           # tsc --noEmit
npm run lint                # eslint .
npm test                    # jest (unit tests only; no DB)
npm run build               # production build (stop the dev server first — both use .next)
npm run migrate             # run pending migrations in src/scripts/migrations (lock-protected)
npm run seed:admin          # create an admin user
npm run sharepoint:check    # read-only SharePoint connectivity + folder listing
```

**Verifying a production build without disturbing a running dev server:**
`NEXT_DIST_DIR=.next-verify npx next build` then `rm -rf .next-verify` (`next.config.ts` reads
`NEXT_DIST_DIR`; `.next-verify/` is git-ignored). If tsc complains about `.next/types/...` for a
route you deleted, delete `.next/types` (dev regenerates it).

Environment: **Windows**, Git Bash + PowerShell, Node 25. Script with tsx using the alias:
put throwaway scripts in `src/scripts/_name.ts`, run `npx tsx --env-file=.env.local src/scripts/_name.ts`,
delete after. Python is available for multi-line file patches (files may have CRLF endings).

## 3. Layout

```
src/app/                    pages (server components) + client components beside them
  dashboard/                overview (also served at "/")
  purchase-orders/          PO list/detail, quotes (/quotes, /quotes/import, /quotes/new, /quotes/[id])
  items/                    Un-Verified Items list (/items) and item detail/edit (/items/[id])
  catalog/                  catalog list, /new, /conflicts, /import (Master File), /flagged
  images/                   Images page (link health + uploads)
  marketplace-export/       per-platform export review + file download
  admin/                    users, monday-pull (Monday import); admin/import-review only redirects
  settings/, help/, login/
  api/                      route handlers (REST); every handler checks its own role
src/lib/                    domain logic (no React)
  authz.ts                  getSession (request-cached), requireRole, ROLE_SETS, roleCan
  auth.ts                   NextAuth config (credentials + email OTP, sessionVersion revocation)
  db.ts                     cached Mongoose connection (pool sized for serverless)
  sharepoint/client.ts      Graph client: folders, upload sessions, move, delete, existence $batch
  purchase-orders/          files.ts (PO docs in SharePoint), fromQuotation.ts, listQuery/listState,
                            transitions.ts (status rules, checklist gate)
  import/                   parseMasterFile.ts, commitRows.ts (commit/exclude/status), reviewQuery.ts
  quote-import/             vendor PI parser (xls/xlsx/csv, multi-sheet, preamble PO number)
  monday/                   client, config (board/column ids, label maps), pull.ts, sync.ts (push)
  catalog/                  authoritative fields, reconciliation, SKU split, variation families
  items/images.ts           image naming convention + completeness
  client/uploadItemImage.ts browser -> SharePoint image upload
  hooks/useRefreshAfterSave.ts
src/models/                 Mongoose models (register.ts registers all for populate)
src/middleware.ts           route-prefix role gate, CSRF origin check, body-size caps, login redirects
src/scripts/migrations/     dated migrations (run via npm run migrate)
```

## 4. Core flows

### How items are created (only these four ways)
| Path | Lands in | Code |
|---|---|---|
| Commit a vendor quote (file or hand entry) | **Un-Verified Items** (`intakeSource: manual_quote`) + a PO | `api/quotations/[id]/commit` |
| Monday import, PO at In Production (`pi_confirmed`) or later | **Un-Verified Items** (`intakeSource: monday_pull`), one item per PO | `lib/monday/pull.ts` materialize |
| Master File import | **Catalog** (`inCatalog: true`) | `lib/import/commitRows.ts` |
| Catalog → New catalog item (with variations) | **Catalog** | `api/catalog` POST |

There is deliberately **no generic "create item" endpoint** (`POST /api/items` was removed).
Un-Verified items reach the catalog via *Submit to catalog* on the item page (`SubmitToCatalog.tsx`; lists
what's missing until `masterRecordComplete`; marketplace_listing + admin) + admin approval on the Catalog list.

### Vendor quotes → items + PO
1. `/purchase-orders/quotes/import`: the browser uploads the file **straight to SharePoint**
   (`POST /api/quotations/upload-session` → chunked PUT to the Graph `uploadUrl` → signed ticket), then
   `POST /api/quotations` with `{ file: { ticket, driveItemId } }` downloads + parses it server-side.
   Multi-sheet workbooks return 409 + candidates; the picker resubmits with `sheetName` (no re-upload).
   The form asks only for the vendor and the file: the **PO number is the file name**
   (`22906.xlsx` → PO `22906`), derived server-side from the upload ticket's name, so the file goes
   straight into `Purchase Orders/22906/`. The hand-entry form (`/quotes/new`) is the same: vendor + a
   required PO number. Quotes have no season or received date.
   **PO numbers are stored bare** (`22906`, exactly as Monday names the board item), so an uploaded PI,
   a hand-entered quote, a sample PO and the Monday PO for one order are the same PO. "PO-22906" is
   only a label in the UI. One rule everywhere: `formatPoNumber` (`lib/purchase-orders/poNumber.ts`)
   drops a leading `PO` / `PO-` / `PO#` and stray `#`s; `normalizePoNumber` and the Monday pull use it.
2. Rows stage in `quotation_rows` (`coerced` values + `flags`), reviewed on `/purchase-orders/quotes/[id]`.
3. Commit (`commit` route): per-quote lock (`commitLockedAt`), creates/merges items, reconciles against
   catalog items (conflicts), attaches the quote to its PO (`fromQuotation.ts`; normalized PO number,
   `Q-xxxxxx` if none), and files the document into `Purchase Orders/{po}/`.

### Master File import → review → Flagged Items (admin only)
- `/catalog/import`: upload; rows stage in `import_batch_rows`. **Recent imports** is a record only;
  "Continue review" shows only while the file has rows waiting (status `needs_review`).
- `/catalog/import/[batchId]`: triage — commit unflagged to catalog, send flagged/all/selected to
  Flagged Items, exclude selected; search applies. API: `.../rows/act`.
- `/catalog/flagged`: rows with `parkedAt` set, across files. Issue filter (by flagged field), set one
  value for all filtered rows (`api/admin/flagged-items/set-value`), inline fixes, commit/return/exclude
  (`api/admin/flagged-items/act`).
- Fixes go through `fixRowField` → `coerceMasterFileValue` (the importer's own rules), so a flag clears
  only when the value is valid.
- **Committed and excluded rows are deleted**; the batch keeps running totals (`approvedRows` =
  committed, `rejectedRows` = excluded). Status: `updateBatchStatus` (needs_review / reviewed / committed).

### Monday.com
- **Pull** (`/admin/monday-pull`): preview the whole board (`GET /api/monday/pull`), filter/select rows,
  POST only the selected **board ids**; the server rebuilds rows from one fresh board read
  (`commitSelectedPullRows`). Matches POs by PO number = item name. Stores the board's status label
  verbatim (`mondayStatusText`) and maps it to `status` only when the mapping is confident.
  Finished labels (Received, Canceled, …) mean **closed**: such POs are read-only and excluded from "open".
- **PO files go to SharePoint for good.** The import has an "Also save PO files to SharePoint" option
  (on by default); the panel then copies each PO's board files into `Purchase Orders/{poNumber}/`
  (`POST /api/admin/po-files`, ~40 s batches, resumable). One PO: "Copy to SharePoint" on the PO page
  (`POST /api/purchase-orders/[id]/files`, purchaseOrders role). Job `archive_po_files` does the same.
  All three use `archiveMondayFiles` (`lib/purchase-orders/files.ts`): each PO is claimed atomically
  (`archiveLockedAt`, 5-min lease) so overlapping runs never copy twice; a file already in the folder
  but unrecorded (run cut off after uploading) is adopted by name, never a quote's uncommitted PI;
  recording is idempotent per asset; an attempt is counted before each download, so killed runs count;
  3 failures or "deleted on Monday" → given up (`archiveGaveUp`). The PO page opens files from
  SharePoint only; a given-up file is the one case that still links to Monday.
- **Push** (`lib/monday/sync.ts`): status/checklist to the board; never pushes an unmapped status,
  skips POs closed on Monday. Pull stamps `lastPushedToMondayAt` so pulled POs don't look changed.

### Purchase orders
Status flow in `lib/purchase-orders/transitions.ts` (forward-only except admin "move back";
`ready_to_ship` requires all six back-office checklist items). **"Open" PO** = `OPEN_PO_CONDITIONS`
in `listQuery.ts` (not received, not closed on Monday) — reuse it anywhere you count open POs.

### Images
Folder `Images/{itemNumber or sampleSku}/{Main|Sides|Models|Lifestyle}`; names `{key}.jpg`, `{key}-S{n}`,
`{key}-M{n}`, `{key}-LS{n}` (`inferSubfolder` rejects names that don't start with the key). **Lifestyle is
optional**: its folder is created only when one is uploaded, and it never counts in `imageCompleteness`
(the type list is `IMAGE_SUBFOLDERS` in `lib/enums.ts`). Uploads are browser → SharePoint:
`api/items/[id]/media/upload-session` (server picks the conventional name for main/sides/models, or
"auto" keeps the file's name) → `.../media/confirm`. `/images` checks links via Graph `$batch`
(`api/images/check`) and records `media.linkStatus`; broken images don't count in `imageCompleteness`,
which feeds `masterRecordComplete` (the publish gate: item number, category, metal, MSRP, all 3 image types).

### Other pages
Dashboard (`/`, `/dashboard`), Marketplace Export (Target CSV; Macy's/Belk/Kohl's XLSX matching the real
templates; inactive items never exported), Help & Support (`/help`, emails the developer via SMTP,
5/hour/user, sent "as" the signed-in user via From name + Reply-To).

## 5. Roles & auth

Roles: `administrator`, `buyer_merchandiser`, `buying_purchasing`, `warehouse_receiving`, `photography`,
`marketplace_listing`. Administrator passes every check.
- Two layers: `middleware.ts` (route-prefix gate, `PAGE_ROUTE_ROLES` / `API_ROUTE_ROLES`, plus the
  `matcher` list — **a new top-level page or API prefix must be added to `matcher`**) and
  `requireRole(ROLE_SETS.x)` inside **every** API handler. Pages that are admin-only also check
  `getSessionRole()` and redirect.
- `ROLE_SETS`: `quotes` (view POs/quotes), `purchaseOrders` (change POs: buying_purchasing),
  `items`, `media` (photography, buying_purchasing), `marketplaceExport`, `adminOnly` ([]).
- Login: credentials + email OTP (`OTP_2FA_ENABLED`), rate-limited (Mongo-backed). JWT sessions carry
  `role` + `sessionVersion`; the jwt callback re-checks the DB each request, so bumping
  `sessionVersion` (sign out everywhere, **role change**, deactivation) revokes sessions immediately.
- Use `getSession()` from `lib/authz.ts` (React `cache`, one DB check per request), not
  `getServerSession` directly.

## 6. Rules and gotchas (learned the hard way)

**Data**
- `items.itemNumber` is **unique + sparse**: never write `itemNumber: null` (null counts as a value →
  duplicate-key errors). Leave the field out until a SKU exists.
- Staged rows' `coerced` objects use **dotted keys** (`"pricing.msrp"`, `"specs.metal"`). Read them as
  `coerced["pricing.msrp"]`; write the whole `coerced` object. Only top-level keys (`itemNumber`,
  `title`, `category`, `brand`) are queryable as `coerced.x`. (MongoDB is 8.0; dotted names are fine.)
- When updating an existing item from an import, `$set` **individual paths**; never assign a nested
  object (it wipes sibling fields like other specs).
- Bulk writes use client-assigned `_id`s and `ordered: false`; link only the ops that succeeded.
- Writes that aren't user edits (sync stamps, archive, link checks) use `{ timestamps: false }` so
  `updatedAt` doesn't change (the Monday push compares it to `lastPushedToMondayAt`).
- Concurrency-sensitive actions are claimed atomically (`findOneAndUpdate` on a status/lock):
  quote commit lock, conflict resolve, OTP redemption.
- Route params: validate ids with `isObjectId()` (`lib/ids.ts`) → 404, before any `findById`.
- **Keep the DB minimal** (audit 2026-10-23): no `default: null` / `default: []` on fields most
  documents don't use (leave them out; `{ f: null }` queries still match missing fields); don't
  write `x ?? null`, omit the key. Staged rows (`import_batch_rows`, `quotation_rows`) store no
  `raw` copy of the sheet row. Add an index only for a query that exists, and not one a compound
  index already leads with. After changing indexes, a migration runs `syncIndexes()`.
- Pages are server components that query MongoDB directly; there are deliberately **no GET list/
  detail API routes** for them. Add an API route only for something the browser actually calls.

**Next.js / platform**
- **Vercel caps request bodies at 4.5 MB**. Anything that can be larger goes browser → SharePoint via a
  Graph upload session (quotes, images). The Master File upload still goes through the server — known
  follow-up. Long handlers set `export const maxDuration = 60` and do work in ~40 s slices.
- Route files (`route.ts`) may only export handlers/config — put shared constants in `lib/`.
- **CSP**: `script-src 'self' 'unsafe-inline'` in production on purpose — App Router streams page data
  in inline scripts; a hash-only CSP renders every page blank. `connect-src` includes
  `https://*.sharepoint.com` for direct uploads.
- `redirect()`/`notFound()` inside streamed routes still return HTTP 200 with the marker in the body.
- On Windows, deleting a route folder while `yarn dev` runs can leave it "delete pending" → eslint/build
  fail with `EPERM scandir`. Ask the user to stop the dev server; don't kill it yourself.

**UI conventions**
- Tailwind with design tokens (`bg-surface`, `text-ink-soft`, `bg-brass`, `text-warn`, …) from
  `globals.css` / `tailwind.config.ts`; components in `src/components/ui` (`Button`, `Card`, `Field`, `Pill`).
- Saves: `Button loading={…}` + `useRefreshAfterSave()` so the button stays busy until the refreshed
  data is on screen. Keep a busy state when a save navigates (`router.push`).
- Lists: server-side pagination with `Pagination` (includes go-to-page + first/last); filters live in
  the URL; client-side tables use `PageJump` with `onJump`.
- Every page renders inside `AppShell` (pass `activeHref`; optional back link). New nav items go in
  `AppShell` NAV + an icon in `Sidebar` ICONS. A sub-page goes in its parent's `children` (shown as
  a dropdown): Quotes, Un-Verified Items and Monday Import (admin) under Purchase Orders; New
  catalog item, Import Master File (admin) and Flagged Items (admin) under Catalog. The list pages
  themselves carry no buttons for these; Catalog shows four stat cards instead. A sub-page's
  `activeHref` is its own path (`/catalog/flagged`), so the sub-item, not the parent, highlights.
- Copy style: plain words for non-technical staff; no jargon in UI text.
- Whole-collection counts are cached briefly with `unstable_cache`: dashboard counts (30 s) and
  catalog facets (`lib/catalog/facets.ts`, 2 min). A route that adds/changes catalog items calls
  `refreshCatalogFacets()`.

**Security**
- `public/` is served to anyone without login. Never put data files there (sample vendor PIs live
  in `samples/vendor-pi/`).
- Middleware refuses mutating API calls that are cross-origin, that carry the session cookie with
  no Origin/Referer, or that send a body without Content-Length; JSON bodies are capped at 1 MB.
- Monday proxy routes (`api/monday/files`, `api/monday/updates`) only serve items/files belonging
  to a PO in the app. Public `/api/health` never returns error details.
- Passwords (when set): 10+ characters, a letter and a number, at most 72 bytes (bcrypt limit).
  Changing your password signs out your other devices (`lib/sessionCookie.ts` keeps this one); an admin
  reset signs the user out everywhere; admins can't reset their own password from Users.
- `safeCallbackPath` resolves the path like a browser and requires it to stay on-site (tab/newline tricks).
- Every staged-row fix is allow-listed and re-coerced: quote rows via `coerceQuoteValue`, Master File rows via
  `isMasterFileField` + `fixRowField` (commit also skips non-column paths), so a fix can't set fields like
  `inCatalog` and a flag clears only when the value is valid.
- Marketplace export: page and generator share `EXPORT_ELIGIBLE`; the Target CSV neutralizes formula-like
  text (`neutralizeFormula`).
- Outbound calls have timeouts: Monday 30 s (non-JSON answers become `MondayApiError`), Graph 60 s.
- Client fetch handlers always `catch` (show "Couldn't reach the server") and parse JSON with `.catch(() => ({}))`.

## 7. Environment variables (`.env.local`; template in `.env.local.example`)
`MONGODB_URI` (non-SRV string), `NEXTAUTH_SECRET` (also signs upload tickets), `NEXTAUTH_URL`,
`MONDAY_API_TOKEN`, `MONDAY_API_URL`, `SHAREPOINT_TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` /
`SITE_URL` / `SITE_ID` / `IMAGES_LIBRARY_ID`, optional `SHAREPOINT_PO_FOLDER` (default "Purchase Orders"),
`SMTP_*`, `OTP_2FA_ENABLED`, `NEXT_PUBLIC_OTP_2FA_ENABLED`, optional `SUPPORT_EMAIL`, `JOBS_WORKER_TOKEN`
(for `/api/jobs/tick`), `SENTRY_*`, `DEPLOYMENT_TARGET`. **Never print or commit secret values.**

SharePoint: app-only Graph access (client credentials, `Sites.Selected`) to the **CZCPIM** site only.
People need CZCPIM site membership to open the links the app shows.

## 8. Testing and verification
- Before finishing: `npm run typecheck`, `npm run lint`, `npm test`; for routing/config changes also a
  production build into `.next-verify`.
- Unit tests live beside the code (`*.test.ts`); they don't touch the database.
- **Ask before running anything that writes to the real MongoDB** (e2e crawls, seeding). The user
  declined DB-writing test runs before. Read-only checks (queries, `$documents` pipelines) are fine.
- Live SharePoint/Monday checks are acceptable when they use clearly named temporary files/folders
  (`_selftest-*`) and delete them afterwards.
- Atlas sometimes refuses connections after the machine sleeps or the IP changes (IP Access List);
  that's environmental, not a code bug.

## 9. Status (2026-10-28)
Built: auth + 2FA, roles, PO list/detail + Monday push/pull, vendor quote intake + review + commit,
catalog (+ variations, conflicts, approvals, Submit to catalog), Master File import + Flagged Items,
Un-Verified Items, SharePoint images (incl. optional Lifestyle) + PO documents (Monday files saved to
SharePoint for good), Images page, marketplace export, dashboard, settings, Help & Support, sidebar
dropdowns.

Open decisions (see the blueprint's "Open — decisions needed"): whether export enforces
`masterRecordComplete` (not yet: almost no item has images), whether photography/warehouse should see
pricing, and a "send back" for catalog submissions. Known gaps: SKU change leaves images in the old
folder; the Master File import doesn't refuse case-only duplicate SKUs; no button for bulk Monday push.

Pending: run `npm run migrate` to apply `2026-10-22-unset-null-item-numbers` and
`2026-10-23-slim-database` (removes `raw` rows, null fields, dead fields, 3 empty collections,
unused indexes).

Not built / open: receiving & warehouse screen (role has no screen yet; its `ReceivingLog` and
`Shipment` models were removed 2026-10-23 as unused — recreate when built), shipment grouping, extracting
photos embedded in PI files, sample-SKU → item-number folder rename trigger (`renameItemFolder` exists,
unused), notification emails (prefs saved, unused), Master File upload > 4.5 MB on Vercel, in-app image
viewing for users without SharePoint access, scheduler/cron for background jobs, nonce-based CSP,
import of Joel's OneDrive folders (app has no access yet).

Before go-live: load the Master File and run a Monday import (the DB currently holds little real data),
let the first SharePoint file copy finish, run migrations, rotate the credentials that were shared
during setup, replace the temporary admin passwords, set up Vercel + Atlas network access.
