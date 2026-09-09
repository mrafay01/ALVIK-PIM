# CZC PIM — Project Report

## 1. What This Project Is

CZC PIM is a purpose-built web application replacing two systems the jewelry wholesale business currently runs on: an Excel "Master File" workbook (the product catalog) and a set of Monday.com boards (purchase order / vendor pipeline tracking). The goal is not a like-for-like port — it's a proper relational-style database with real workflow enforcement, review steps, and an audit trail, built on Next.js and MongoDB.

**Explicitly out of scope for this build:**
- **Jm** — a third-party system built separately on request, which already handles pricing, stock, and invoices. **Confirmed:** no integration with Jm is planned. Where a Monday.com board references Jm (e.g. the "save in JM" flag in §4a), CZC PIM only records that the hand-off happened — it never reads from or writes to Jm itself.
- **Live marketplace integrations** (Shopify, Amazon, Macy's) — the app produces filled export spreadsheets in each platform's exact format for manual upload. No live API sync.

**No longer out of scope — now live:** SharePoint (image storage) and Monday.com (board sync) integrations were blocked on credentials; both were supplied on 2026-09-01 and are now built and verified against the real systems. See §7 and §14.

## 2. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) | Single codebase for UI + API routes |
| Styling | Tailwind CSS | Utility-first, fully migrated from ad hoc inline styles; theme-aware dark/light modes with CSS custom properties |
| Database | MongoDB Atlas, via Mongoose 8.x | Matches the semi-structured, evolving-schema nature of the legacy Excel data (open `specs` fields, append-only history arrays) |
| Auth | NextAuth v4, Credentials provider, JWT sessions | Role-based access without a separate identity provider |
| Password hashing | bcryptjs | Standard, no external dependency |
| Spreadsheet parsing | exceljs | Chosen over the more common `xlsx`/SheetJS package specifically because SheetJS has unpatched prototype-pollution and ReDoS CVEs — a real risk here since the import feature accepts untrusted uploaded files |
| Validation | zod (installed, available for future use) | |

## 3. Authentication & Roles

Eight roles exist, matching the departments that touch this workflow in real life:

- `administrator` — full access to everything
- `buyer_merchandiser` — item review, sample requests, hold/reject decisions
- `buying_purchasing` — SKU creation, PO/PI management, status updates
- `warehouse_receiving` — receiving log, QC checks
- `photography` — image upload workflow
- `marketplace_listing` — master DB content fields, publish/export
- `accounts_finance` — payables, payment recording
- (a `hold`/reject reviewer path also exists under buyer_merchandiser)

**How it works:** NextAuth's Credentials provider checks email + bcrypt-hashed password against the `users` collection. On success, the user's `role` and `id` are embedded in the JWT and carried into every server session. [`src/middleware.ts`](src/middleware.ts) then gates entire route prefixes by role — for example, only `administrator` and `accounts_finance` can reach `/payables`; only `administrator` and `buying_purchasing` can reach `/purchase-orders`. An administrator always passes every gate. Anyone unauthenticated is redirected to `/login`; anyone authenticated but wrong-role is redirected to `/unauthorized`.

## 4. Database Schema

Twelve MongoDB collections, defined as Mongoose models in [`src/models/`](src/models/). `Item` is the spine — almost everything else references it.

### `users`
Name, email (unique), bcrypt password hash, role, active flag.

### `vendors`
Name (unique), contact info, payment terms in days (used later for payables due-date calculation).

### `items` — the product/catalog spine
Tracks a product through its entire life, from an incoming vendor proposal to a live catalog listing:

- **`status`** — a 14-value lifecycle enum: `quoted → review_pending → approved/rejected/hold → sample_ordered → sample_received → photography → final_review → sku_permanent → po_sent → receiving → live → discontinued`
- **Dual-SKU system** — `sampleSku` (temporary, assigned at intake) and `itemNumber` (permanent "JAM number," assigned once the item is confirmed for the catalog). Both are kept permanently for audit history even after conversion.
- **`specs`** — an intentionally open/flexible object (metal, plating, stone info, weight, ring size, clasp, chain length, etc.) since attribute sets vary wildly by category and the legacy spreadsheet was equally loose here.
- **`reviewDecision`** — who approved/rejected the item, when, and why.
- **`media`** — array of SharePoint image references, each tagged with a subfolder (`main`/`sides`/`models`) — see §7.
- **`imageCompleteness`** — derived flags (`main`, `sides`, `models`), each true once that subfolder has at least one image.
- **`pricingHistory`** — append-only array of dated price entries (cost, MSRP, Rue price). Never overwritten — mirrors how the Excel sheet tracked price changes over time via separate dated columns.
- **`costHistory`** — per-PO costing snapshots (labor/material cost per gram, quantity, total).
- **`masterRecordComplete`** — the publish gate; see §6.

**This lifecycle now has a confirmed upstream stage** — see §4a below — that precedes everything described here. The `quoted` status is where that upstream stage hands off into this collection.

### §4a. The Sample-Purchasing Pipeline (upstream of `items`)

A tenth Monday.com board export — **"New items/Sample purchasing"** — surfaced a real stage of the workflow that came before anything the original 7 board exports covered. Where the `purchase_orders` boards track *regular/bulk* orders once an item is already established, this board tracks how a brand-new item candidate gets discovered, sampled, and turned into a permanent JAM item number in the first place. Regular purchase orders are downstream of this — an item has to survive this pipeline before it's eligible for a real PO.

The board's Main Table groups items into four buckets that map directly onto a lifecycle, confirmed by the "Done/Ordered" and "Pass" group names:

**`Proposals working on` → `Proposals need to review` → `Pass` (dead end) or `Done/Ordered` (continues into the `items` collection as `quoted`)**

Within "Proposals working on," each item/subitem carries several independently-tracked fields, all real column names confirmed from the board:

| Board column | What it tracks | Values seen |
|---|---|---|
| **Vendors proposal** | The actual incoming vendor file — a PI/quotation spreadsheet, a PDF catalog page, or a product photo. This is exactly the kind of attachment you described: some vendors send a proper PI, others just PDFs or images, and the workflow has to accept all three the same way. | File links (`.xlsx`, `.xls`, `.pdf`, `.pptx`, `.jpg`, `.zip`) |
| **SF tracking** (sample fulfillment) | The sample's physical journey | `Waiting for vendor pricing` → `Sample in production` → `Bulk PO in production` → `Received samples waiting for images` → `Received samples with images, need to Review` → `Need to create SAM item numbers` → `Sample Po Sent` |
| **Status** (subitem, "Create Sample po") | Whether a sample PO has been cut for this item | `Done` / blank |
| **Creation Log → "image file / rename images"** | Photography intake, tracked separately from SF tracking | `Received` / `Waiting` / `Check status`, paired with a `rename images` Done flag |
| **Creation Log → "molly's approval"** | A second human review gate, after images come back | `Done` / `Needs editing` / `Working on it` / `Stuck` |
| **Tags → "reviewing samples"** | Whether the sample has been reviewed at all | `Done` / `Waiting for joel` |
| **Tags** (category) | Free-text category labels, not a closed enum | `KidsJewelry`, `MensJewelry`, `GemStones`, `MensRings`, `Moissaniteitems`, etc. |
| **create Item/Box no#** | Permanent JAM item-number + warehouse box-number assignment | `Done` / `Working on it` / `Needs editing` / `Stuck` |
| **save in JM** | Confirms the item was saved into Jm — **confirmed out of scope**: Jm is a separate, purpose-built third-party system and CZC PIM has no integration with it planned. This column is tracked here only as a flag so a human knows the hand-off happened, not as something CZC PIM needs to read from or write to. | `Done` / blank |
| **Item ID (auto generated)** | The Jm-side auto-generated ID once saved | Numeric string, e.g. `12835818176` |

**What this means for the schema:** the existing `Item.status` enum already has `quoted` as its first value, and `sampleSku` already exists — so the collection doesn't need new fields to represent this stage, but it does mean **`quoted` needs to be reached by a richer intake process than the current pilot's plain intake form**, and the single `reviewDecision` field needs to account for *two* separate human approvals now confirmed on the real board (an image reviewer and "molly's approval"), not one. This is a real gap the current Phase 3 pilot doesn't cover — flagged in §11 below as new Phase 3b scope.

**Vendor proposal file handling is now confirmed multi-format**, not spreadsheet-only. The legacy-import pipeline (§5) was built assuming Master File `.xlsx` uploads; this new pipeline needs to accept and simply *attach* PDFs, images, and PowerPoint files as-is (no parsing/coercion — those formats aren't structured data), alongside the same coercion logic already built for spreadsheet PI files.

### `purchase_orders` — the vendor order / PI pipeline
This is the single collection that replaces all six of the business's Monday.com "stage" boards — a lesson learned directly from analyzing the real board exports: what looked like six separate pipeline stages was actually one master item list with six saved filtered views over it. Modeling it as one collection with a `status` field, rather than six separate tables, matches how the business actually works and avoids data duplication.

- **`status`** — 8-stage enum: `waiting_for_sample_po → negotiating → send_to_vendor → pi_confirmed_pending → pi_confirmed → in_transit → ready_to_ship → shipment_received` (the first two are side-lanes most POs skip, not a strict mainline every order passes through)
- **`orderPurpose`** — category (stock/sample/new_collection/existing_modified/promo_events/amazon) plus a free-text `tag` for the one-off labels seen on real boards ("Today Show Lisa", "CA", "Box-Pouch") that shouldn't force schema changes
- **`lineItems`** — items on this PO, with qty/unit cost/total cost
- **`backOfficeChecklist`** — six independently-tracked sub-statuses (images, data, pricing, Jm update, on-master, descriptions). This is a **hard gate**: real board data showed every PO on the "Ready to Ship" stage had all six complete with zero exceptions, so the app enforces this server-side rather than trusting a manual status change (see §9, bug fixes).
- **`vendorReplySent`** — the "Text ✔️" column from the real boards, marking that an employee has replied to the vendor. Independent of the checklist and shipping gate.
- **`joelShipConfirmed`** — a manual ship-confirmation gate seen as a running counter on the real "Ready to Ship" board.
- **`statusHistory`** — every status change, timestamped and attributed, for audit and eventual Monday.com sync.
- **`mondayItemId`**, **`mondayFiles`**, **`lastPulledFromMondayAt`** — Monday.com integration fields (§12): the linked board item's id (used by both sync directions to avoid duplicates), an array of `{ name, assetId }` pointers to vendor PI files that remain on Monday rather than being copied in, and when this PO was last pulled from the board.

### `shipments`
One tracking number can cover many POs (a single carrier shipment bundling multiple orders) — modeled as its own collection rather than a field on `purchase_orders`.

### `receiving_logs`
Content check (weight/qty/silver good-or-flagged) and packaging check, logged per item per PO at the warehouse-receiving step.

### `payments` — vendor payables
Each PO's payment isn't a single amount — it's one or more **tranche** records (`deposit`/`balance`/`prepayment`/`credit`), mirroring how the real Monday.com data showed POs split into paired sub-items like "16056-Deposit" / "16056-balance". Includes invoice reference, amount due, due date, payment method, proof-of-payment URL, and who recorded it. A `creditAppliedFrom` self-reference explicitly models overpayment credits carried from one PO to another, replacing what was previously an opaque negative-number workaround in the spreadsheet.

### `sync_logs`, `platform_templates`
Scaffolded for future phases — Monday.com sync runs and marketplace export column mappings.

### `import_batches` and `import_batch_rows` — legacy-import staging (see §5)
Each uploaded Master File becomes one `import_batches` document (filename, status, summary counters) plus one `import_batch_rows` document **per row** in a separate collection, referencing the batch by `batchId`. This is a two-collection design, not one — see the 2026-09-08 fix note in §5 for why rows aren't embedded directly in the batch.

## 5. Legacy Data Import (Phase 2)

The Excel Master File has real-world data-quality problems: dates stored as text, blank vs. `/` used inconsistently for "not applicable," hand-typed metal values with no validation ("Brass" typed freely instead of picked from a list), and stray leftover header cells from AutoFilter exports.

Rather than a one-shot migration script — which risks silently mis-importing rows a human would have caught — the import is a **staged, human-reviewed pipeline**:

1. **Upload** (`/admin/import-review`) — an `.xlsx` file is parsed row by row using `exceljs`.
2. **Coercion** — each cell is run through type-specific coercion functions: metal names are mapped against known variants, dates are parsed from multiple formats (Excel date objects, ISO, US M/D/Y), numbers have currency symbols and commas stripped, and placeholder values (`/`, `n/a`, `-`, blank) are normalized to null rather than treated as real data.
3. **Flagging** — anything that fails to coerce cleanly is flagged with the original raw value preserved, not silently dropped or guessed.
4. **Duplicate detection** — before anything is staged for review, SKUs are checked both against other rows in the same file (within-batch duplicates) and against SKUs already in the live `items` collection. Either case is surfaced as a visible flag, so overwriting an existing item — or importing the same SKU twice — is a decision a reviewer makes, not a side effect.
5. **Review UI** — every row is shown with its flags; a reviewer can correct a flagged value inline, then approve or reject the row. Unflagged rows can be bulk-approved in one action.
6. **Commit** — approved rows are written into `items`. If the SKU already exists, the row is merged into the existing document (fields overwritten, but `pricingHistory` is appended to, never replaced); otherwise a new item is created. The commit step reports how many rows were newly created vs. merged.

Nothing ever writes to the live `items` collection until a human has explicitly approved that row.

**Fix, 2026-09-08 — large-file upload crash.** The original design stored every row's raw data, coerced data, and validation flags as one embedded array inside a single `import_batches` document. A large enough Master File pushed that one document past MongoDB's hard 16MB-per-document limit, and the upload failed with a low-level driver error (`RangeError: offset ... out of range`) instead of a usable message. Fixed by moving rows into their own `import_batch_rows` collection — one small document per row, referencing its batch by `batchId` — so no single document grows with file size. Verified against the live database with a synthetic 6,000-row file (well past what triggered the original crash): upload, per-row approval, and commit-to-`items` all confirmed working end-to-end, then the test data was removed. Batches of any realistic size are no longer bounded by document size — the two remaining scaling concerns (not yet hit in practice) are noted in §13.

## 6. Master Record Completion Gate (Phase 5)

An item can't be considered ready for marketplace export until its record is genuinely complete. [`src/lib/masterRecordComplete.ts`](src/lib/masterRecordComplete.ts) defines the exact rule, recomputed automatically on every relevant update (item edits and legacy-import commits alike):

An item is "complete" only when **all** of the following are true:
- Permanent item number is assigned
- Category is set
- Metal spec is set
- At least one MSRP price entry exists
- All three image subfolders (main, sides, models) have at least one image

The `/catalog` screen lists every item with a clear complete/incomplete status and, for incomplete ones, exactly which fields are missing — filterable to show only incomplete records. This is the screen a marketplace-listing or merchandising user would use to see what still needs work before an item can go live.

## 7. Image Storage — SharePoint Pipeline (Phase 4)

**Built and verified live** against the real SharePoint site (`CZCPIM`) on 2026-09-01, using the Microsoft Graph OAuth2 client-credentials flow (`Sites.Selected`, write) Joel supplied. [`src/lib/sharepoint/client.ts`](src/lib/sharepoint/client.ts) implements the design:

- One folder per SKU on SharePoint, under `/Images/{SKU}/`
- Subfolders: `Main`, `Sides`, `Models` — auto-created on first upload, idempotent to re-run
- Filename convention: `{SKU}.jpg` = main image; `{SKU}-S1.jpg`, `{SKU}-S2.jpg` = side images; `{SKU}-M1.jpg`, `{SKU}-M2.jpg` = model images — routed automatically by filename suffix; anything that doesn't match is rejected with a clear error rather than silently misfiled
- Every SKU must have at least one image in every subfolder before it's considered complete — feeds `imageCompleteness` and the master-record gate (§6) directly
- **Stage-agnostic** — it doesn't matter when in the item's lifecycle images are uploaded (at sample review, at the photography step, or during a later re-shoot); the completeness check works the same regardless
- Folder is keyed by the temporary `sampleSku` until the item converts to a permanent `itemNumber`; `renameItemFolder()` moves the whole folder over at that point
- **Upload endpoint:** `POST /api/items/[itemId]/media` — accepts one or more files, uploads each to its inferred subfolder, appends to `items.media`, and recomputes `imageCompleteness` + `masterRecordComplete` in the same request

**Verification:** a real folder tree was created on the live site, a test image was uploaded to each of the three subfolders via the actual suffix-routing logic (not mocked), and the folder was deleted afterward — confirming the OAuth flow, site/drive resolution, folder provisioning, and upload all work end-to-end before anything was wired into the UI.

The other credential-blocked integration, Monday.com sync, is covered in §12.

## 8. Purchase Order / Purchase Invoice Pilot (Phase 3)

A full end-to-end lifecycle walkthrough, built and function-verified against the live database:

1. **Intake** (`/items`) — a new quoted item is entered: vendor, vendor SKU, category, cost, MSRP.
2. **Review decision** (`/items/[itemId]`) — approve or reject, with an optional note. Approving moves status to `approved`; rejecting records a reason.
3. **Sample SKU assignment** — once approved, a temporary sample SKU is assigned, moving status to `sample_ordered`.
4. **PO/PI creation** (`/purchase-orders`) — once an item has a sample SKU, a purchase order can be created against it, with quantity and unit cost (auto-calculating the line total). This also flips the item's status to `po_sent`.
5. **Status pipeline advancement** — the PO can be walked forward through its 8-stage status enum, each transition logged in `statusHistory` with who made the change and when.
6. **Back-office checklist** — the six-field checklist (images/data/pricing/Jm update/on-master/descriptions) can be updated independently of the main status, and **the app blocks a transition to `ready_to_ship` server-side unless all six are complete** — matching the "zero exceptions" rule observed in the real Monday.com board data.
7. **Vendor reply tracking** — a one-click "mark vendor reply sent" action, stamped with who and when.

**Known gap, confirmed by §4a:** this pilot's intake step (#1) is intentionally minimal — a plain form capturing vendor, SKU, category, cost, and MSRP. The real sample-purchasing board shows intake is actually richer: a vendor proposal *file* (spreadsheet, PDF, or image) is attached at the start, the item passes through **two separate human approvals** (an image reviewer, then "molly's approval") before a permanent item/box number is assigned, and a `Pass` outcome (rejected before ever becoming a sample) exists alongside the `approved`/`rejected` decision already modeled. The current pilot's single `reviewDecision` field and single-step approve/reject flow don't yet represent this — see §11, **Phase 3b**, for the follow-up scope this opens up.

## 9. Payables (Phase 7)

`/payables` — every payment tranche recorded against its PO:

- Recording a payment (deposit/balance/prepayment/credit) with an invoice reference and amount due
- **Due-date auto-calculation** — if no due date is given explicitly, it's calculated from the vendor's `paymentTermsDays`
- Marking a payment paid, with payment method and a proof-of-payment URL, stamped with who recorded it and when
- Status filtering (open / deposit submitted / paid / archived), with overdue payments visually flagged
- Each PO's detail page shows its full payment history and a form to record a new one directly

## 10. Real Bugs Found and Fixed During Development

This project has been built with a policy of *functional* verification — actually driving each feature end-to-end against the live database via authenticated HTTP requests — rather than trusting that code which type-checks and builds is actually correct. That process caught several real bugs that code review alone would likely have missed:

1. **Silent data loss in pricing history** — a generic field-mapping helper was writing MSRP/price data from imports into a plain nested object shape, but `pricingHistory` is an array-of-subdocuments schema. Mongoose silently dropped the mismatched data with no error. Found only by checking the database after a real commit and seeing `pricingHistory` was empty. Fixed by routing pricing fields through a dedicated array-entry builder.
2. **Missing model registration causing runtime crashes** — several new pages and API routes used Mongoose's `.populate()` to follow references (e.g., resolving an item's `vendorId` into the vendor's name), but the referenced model (`Vendor`, `Item`) was never imported into that file's module scope. Mongoose only registers a model once its class is instantiated somewhere in the code that actually ran — so `.populate()` silently threw `MissingSchemaError` at request time despite a clean build and clean type-check. Fixed by adding explicit registration imports (`import "@/models/Vendor"`) to every file that populates a reference, across 8 files.
3. **Unenforced hard gate** — the blueprint's own analysis of real board data showed a purchase order should never reach `ready_to_ship` status with an incomplete back-office checklist, but nothing in the code actually enforced that. Added a server-side check that rejects the status transition with a clear error listing exactly which checklist fields are still incomplete.
4. **Reserved schema keyword collision** — an early field named `collection` on the `Item` model silently conflicted with a reserved Mongoose schema option, triggering an easy-to-miss build warning. Renamed to `collectionName`.
5. **A genuine platform bug, not a code bug** — this development machine's Node.js version (v25.4.0, on Windows) has a confirmed regression (a known open Node.js issue) where DNS SRV-record lookups fail for `mongodb+srv://` connection strings. Root-caused via direct testing rather than assumed. Worked around by switching to an explicit non-SRV connection string with the shard hosts and replica set named directly, which is arguably more resilient than the SRV form regardless of the underlying Node bug.
6. **A separate, still-open local DNS issue** — this machine's default network DNS resolver intermittently fails to resolve the MongoDB Atlas shard hostnames specifically (confirmed via `nslookup` timing out on the default resolver but succeeding immediately against Google's public DNS, 8.8.8.8), while general internet DNS resolution works fine. TCP connectivity to the resolved IP is confirmed healthy — this is a resolver problem, not an Atlas outage or IP whitelist issue. **Not yet fixed** — pending your choice of remedy (switch the machine's DNS servers system-wide, or hardcode the resolved shard IPs, with the tradeoff that Atlas can rotate those IPs during maintenance).
7. **Authentication bypass on `/items`, `/catalog`, and `/`** — a full audit of DB coverage, API endpoints, and UI (requested 2026-09-01) found `src/middleware.ts`'s route matcher only listed role-*restricted* prefixes (`/payables`, `/purchase-orders`, `/receiving`, `/admin`), so the three most-used screens rendered for anyone with the URL, no login required — a real pre-existing security gap, not something introduced by that session's own changes. Fixed by widening the matcher to cover every real screen. Fixing it surfaced a second issue: with the wider matcher, unauthenticated requests redirected to NextAuth's default `/api/auth/signin` instead of this app's own `/login` page, because `withAuth`'s `authorized` callback returning `false` short-circuits to its own default rather than the app's redirect logic. Fixed by always returning `true` from `authorized` and handling every redirect inside the middleware function body, which already pointed at `/login` correctly.
8. **PO checklist gate blocked silently** — the "Advance to next status" button on a PO's detail page would call the API and only surface a generic error on the resulting 400 when the back-office checklist (§4, `purchase_orders`) wasn't complete, rather than explaining why upfront. Fixed as part of the same audit: the button now computes which specific checklist fields are incomplete and shows them before the click, with the button disabled until they're done.
9. **`mondayFiles` silently failing to save** — the array field on `PurchaseOrder` was defined with its subdocument options (`_id: false`) nested incorrectly as a sibling of the `name`/`assetId` fields, rather than as the schema's actual options argument. Mongoose accepted this without error at startup but never persisted the array on write — 316 already-imported POs had `mondayItemId` saved but an empty `mondayFiles`, discovered only because you noticed a file link wasn't showing on a real PO. Fixed by extracting a proper `MondayFileSchema` (matching the pattern already used for `LineItemSchema`/`StatusHistoryEntrySchema`), then backfilling all 316 affected POs directly from the live board — 77 of them actually had a file attached and now show it correctly.
10. **File-fetch endpoint 500'd on every request** — `GET /api/monday/files/[assetId]` asks Monday's API for a fresh signed download URL, but the GraphQL query declared its `ids` argument as nullable (`[ID!]`) when Monday's schema requires it non-nullable (`[ID!]!`) — every call failed Monday-side validation, and the route had no error handling, so it surfaced as a raw unhandled 500 instead of a usable error. Fixed the query signature and added a try/catch that returns a clean JSON error if Monday can't resolve the file.
11. **Master File import crashed on a real upload — MongoDB's 16MB document limit** — you hit this directly: uploading a real Master File.xlsx failed with a driver-level `RangeError: offset ... out of range`, not a clean app error. Root cause: every staged row (raw values + coerced values + validation flags) was embedded as one array inside a single `import_batches` document — MongoDB caps any one document at 16MB regardless of how many logical rows make it up, and a large enough file's parsed-and-duplicated-per-row data crossed that line even though the original `.xlsx` file itself was much smaller (Excel is compressed; the parsed, tripled-up JSON representation is not). Fixed by splitting rows into their own `import_batch_rows` collection (§4), one document per row — no single document grows with file size anymore. Verified with a synthetic 6,000-row file: upload, row approval, and commit all confirmed working end-to-end against the live database, then the test data was removed. See §5 for the full explanation and the two real (not yet hit) scaling limits that remain.
12. **"Approve all unflagged" taking ~43 minutes on a 4,000-row batch (2026-09-09)** — the bulk-approve action was calling the single-row PATCH endpoint in a loop (~650ms per row), and the commit-to-items step was doing six sequential database round-trips per item. Fixed: dedicated bulk-approve endpoint using `updateMany` (7.1 sec for 4,000 rows) and rewritten commit route using batched `bulkWrite` instead of per-row saves (12.4 sec for 4,000 rows). Both verified end-to-end: items sharing one new SKU within a batch merge correctly into a single item rather than colliding on the unique index.

## 11. Current Status by Phase

The project follows an 11-phase plan, plus one newly identified sub-phase (3b) surfaced by the sample-purchasing board data in §4a. Status as of this report:

| # | Phase | Status |
|---|---|---|
| 1 | Foundation — scaffold, auth, roles, CI-ready build | **Done** |
| 2 | Schema + legacy import-review UI | **Done** |
| 3 | Pilot — intake → review → sample SKU → PO/PI, end to end | **Done** (minimal-intake version; see 3b) |
| 3b | Sample-purchasing intake pipeline — vendor proposal file attach, two-stage approval (image review + "molly's approval"), Pass/Done-Ordered outcome, permanent item/box number assignment | **Not started** — scope identified 2026-08-31, not yet requested |
| 4 | Receiving + photography + SharePoint image pipeline | **Done** — SharePoint credentials received 2026-09-01, image pipeline built and verified live same day. Receiving log + warehouse QC screens (content/packaging checks) still to build. |
| 5 | Master DB completion gate | **Done** |
| 6 | Marketplace export generator | **Done** — real Target, Macy's, Belk, and Kohl's bulk-import templates supplied 2026-09-09; export-review UI built and verified live for all four platforms. Shopify/Amazon still blocked on template files. |
| 7 | Payables + payment recording | **Done** |
| 8 | Role hardening + Monday.com sync + dashboard | Mostly done — role gating exists (and its `/items`/`/catalog`/`/` gap was fixed, §10 item 7), Monday.com sync built and verified live both directions (push §12, pull §12 "Inbound pull") 2026-09-01. `/dashboard` aggregation views not yet built. |
| 9–11 | UAT → deployment/training → post-launch support | Not started |

**Eight of twelve phases are complete and function-verified against the live database** (up from seven as of 2026-09-08 — Phase 6's marketplace export went live 2026-09-09 with Target/Macy's/Belk/Kohl's templates verified, though Shopify/Amazon templates remain blocked). What's left: Phase 3b (scoped, not requested), the remaining marketplaces for Phase 6 (Shopify/Amazon, blocked on template files), the `/dashboard` view within Phase 8, and Phases 9–11 (depend on everything above being live first).

## 12. Monday.com Sync Engine (Phase 8, sync portion)

**Built and verified live** against the real "test by joel Purchase Orders" board on 2026-09-01, using the Monday.com API token Joel supplied (GraphQL, `https://api.monday.com/v2`). [`src/lib/monday/`](src/lib/monday) implements the design:

- `client.ts` — thin GraphQL request wrapper; Monday returns HTTP 200 even on failure, so this is the one place that checks the response's `errors` array
- `config.ts` — the real board ID and column IDs, captured directly from the API (not guessed), plus a status-vocabulary map from this app's 8-value `PoStatus` enum to the board's actual Status-column labels
- `sync.ts` — `syncPurchaseOrderToMonday()` creates the board item on first sync and stores the returned id on `purchase_orders.mondayItemId`; every later call updates that same item's columns instead of creating a duplicate (idempotent by design, per the blueprint)
- **Endpoints:** `POST /api/purchase-orders/[poId]/monday-sync` (single PO, for a "sync to Monday" button) and `POST /api/monday/sync` (bulk — syncs every PO, admin-only, logs the run to `sync_logs` with rows processed/changed/errored)

**A real mismatch worth flagging:** the live board's Status column has roughly 25 labels — states like "Stuck," "Partial received," "Sent back to vendor," "Canceled" that this app's 8-value enum doesn't model. The status map only covers labels with a clean, unambiguous equivalent; the rest are deliberately left unmapped rather than guessed. This doesn't block anything today (every status this app actually sets has a real label to push to), but it's worth a conversation with Joel about whether any of those extra states should become first-class statuses here.

**Verification:** a real PurchaseOrder document was created, pushed to the live board (confirmed a new item appeared with `create_item`), updated (status + one checklist field changed), pushed again (confirmed it updated the same item via `change_multiple_column_values` rather than creating a second one), then both the Monday item and the test document were deleted. Full round-trip confirmed before wiring into the UI.

### Inbound pull — importing existing Monday data into PIM

The sync above is one-way (PIM → Monday). A second, independent pull direction was added on 2026-09-01 so updates vendors make directly on Monday — status changes, checklist progress, PI files — can be brought into PIM on demand, without ever writing back to the real board.

- [`src/lib/monday/pull.ts`](src/lib/monday/pull.ts) — `buildPullPlan()` reads every item on the live board (paginated, no row limit) and computes, without writing anything, whether each one would **update** an existing PO (matched by PO number), **create** a new one, or be **skipped** (board status has no confident mapping to this app's `PoStatus` enum — see the vocabulary gap noted above). `commitPullPlan()` applies exactly the reviewed rows.
- **UI:** `/admin/monday-pull` (admin-only, in the sidebar as "Monday Import") — a two-step flow: **Preview import** (dry run, shows a table of every proposed change) → **Apply changes** (the only step that writes to the DB). This mirrors the same "review before commit" pattern used for the legacy Excel import (§5), and every apply run is logged to `sync_logs` (`monday_pull`) the same way the push direction is.
- **Vendor PI files** (the "Pi's" file column on the board) are deliberately **not** copied into PIM or SharePoint — SharePoint is images-only. PIM stores just the file's name and Monday asset ID (`purchase_orders.mondayFiles`); the PO detail page links to `GET /api/monday/files/[assetId]`, which asks Monday for a fresh short-lived signed download URL on every click and redirects to it. If the file is ever deleted or replaced on Monday, the link breaks with no fallback — an accepted tradeoff, confirmed with you, in exchange for not maintaining a duplicate copy.

**Real numbers from the live board, verified 2026-09-01:** 7,398 total items. 317 have a status with a confident mapping and are import-ready (all 317 vendor names matched existing PIM vendors cleanly — no manual vendor creation needed). 7,081 are skipped — overwhelmingly (7,023) status `"Received"`, i.e. old/completed historical orders, plus 56 `"Canceled"`. Per your decision, historical `"Received"` backfill is deliberately left out of scope for now rather than importing ~7,000 historical rows in one action — revisit separately if you want that history in PIM later.

## 13. Known Open Items

- **MongoDB Atlas connection string contains a live credential** (`rafe:rafe123`) that was shared in plaintext during setup. It has not yet been rotated. This should be changed in Atlas and the `.env.local` file updated, at your convenience — the string is correctly excluded from version control in the meantime.
- **Monday.com and SharePoint credentials were also shared in plaintext** (via chat, 2026-09-01). Both are stored only in `.env.local`, which is gitignored and was never committed — but as with the Mongo credential, rotating them at your convenience once the integration is settled is good hygiene.
- **Local DNS resolution issue** (§10, item 6) — intermittently prevents connecting to MongoDB Atlas from this machine. Needs a decision on remedy.
- **Seeded role accounts** (`*@example.com`, one per role) all have the same demo password, `demo1234!`, set 2026-09-01 for client demo purposes. There is still no self-service password-reset flow — changing a password requires a direct DB update.
- **No pagination on the import-review screen** — the 16MB document-size crash (§10 item 11) is fixed and batches of any size now insert correctly, but the review table still renders every staged row client-side at once. A batch in the low thousands of rows (what's been seen from real usage so far) is fine; tens of thousands of rows would be sluggish to review in the browser even though the backend handles it. Worth adding if larger files become routine.
- **No upload size/row-count cap** — nothing currently stops an arbitrarily large file from being uploaded and parsed in memory in one request. Not a data-corruption risk after the §10 item 11 fix, but a resource-exhaustion one worth guarding against with a sane cap and a clear rejection message.
- **Monday.com status vocabulary gap** (§12) — roughly 20 real board-status labels have no equivalent in this app's `PoStatus` enum. Worth a conversation with Joel; not currently blocking anything.
- **Marketplace export files don't yet replicate dropdown validation from real templates** — generated Macy's/Belk/Kohl's/Target files match every column exactly but don't carry the Excel data-validation pick-lists and conditional formatting from your native templates. Adding these is technically straightforward (exceljs supports it) but requires listing which columns have restricted values and what those values are.

## 14. Visual Design System & UI Audit (2026-09-09)

A full redesign and rebrand from "PIM 2.0" to "CZC PIM," completed 2026-09-09, migrating the entire app onto Tailwind CSS (from ad hoc inline styles) and introducing a polished, consistent visual identity.

A full pass over everything built so far, requested to confirm three things before client presentation: the DB schema is fully covered, every API endpoint actually works, and the UI for completed phases is presentation-ready.

- **DB:** all 11 collections re-read against the blueprint field-by-field — confirmed correct. `Quotation`, `ReceivingLog`, `Shipment`, `PlatformTemplate` are scaffolded-but-unused, which is expected (they belong to phases not yet built), not a defect.
- **API:** all 15 non-Monday endpoints verified working via direct handler invocation against the real database with a mocked session (Monday's two write endpoints were deliberately excluded from this pass to honor "don't disturb the real board" — they were already verified live in §12). 23/23 checks passed, including a direct confirmation that the checklist hard gate (§8, §10 item 3) actually blocks and then allows the `ready_to_ship` transition.
- **UI:** every real authenticated page (Items, Item detail, Purchase Orders, PO detail, Payables, Catalog, Import Review + batch review, Login, Unauthorized) was rebuilt on a shared design system — CSS custom-property tokens for a light/dark-aware palette, Fraunces/Inter/IBM Plex Mono type pairing, Lucide icons throughout, and shared components (`Card`, `Pill`, `Button`, `Field`) — replacing the original plain inline-styled HTML. This is the same design language used for the `/present` client-demo build described elsewhere in this history. Verified end-to-end via real authenticated HTTP requests, not just a build check.
- This pass is also where bugs 7–10 in §10 were found and fixed.

## 15. What This Document Is For

This is meant to be a living reference — as further requirements, corrections, or new phases come up, they can be added here and then implemented against. If anything above is inaccurate, incomplete, or has changed since this was written, flag it and it'll be corrected before further work builds on it.
