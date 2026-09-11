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

Fourteen MongoDB collections, defined as Mongoose models in [`src/models/`](src/models/) (`import_batches` split into two 2026-09-08; `marketplace_listings` added 2026-09-09; `quotation_rows` added 2026-09-10 alongside the extended `quotations`). `Item` is the spine — almost everything else references it.

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
- **`customFields`** — a free-form `Map<string,string>` (label → text) for columns a vendor quote carried that don't map to a known spec field. A quote sheet's column set isn't fixed, so unrecognized columns are kept here under the vendor's exact label rather than dropped. Populated by quote intake (§5a); not yet surfaced on the item detail/catalog screens.
- **`masterRecordComplete`** — the publish gate; see §6.
- **`title` / `description` / `bulletFeatures` / `brand` / `upc`** — listing content. `brand`/`upc` come from the Master File import (see §6a — previously silently dropped by the strict root schema).
- **`baseSku` / `variantSuffix`** — SKU family split (before / after the first hyphen), kept in sync with `itemNumber` by a pre-save hook. See §6a "Variations".
- **`origin`** (`master_file` / `manual` / `quotation`), **`inCatalog`**, **`catalogApproval`** (`{ status, approvedBy, approvedAt }`), **`catalogSubmittedAt`** — the catalog membership + approval fields, §6a.

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

### `quotations` and `quotation_rows` — vendor quote intake (see §5a)
Each intaken vendor quote (an uploaded `.xlsx`/`.csv` or a hand-entered one) becomes one `quotations` document (vendor, `source`, optional file name / PO ref / season, `status`, summary counters, and `itemIds` linking the items its commit produced) plus one `quotation_rows` document **per line item** in a separate collection, `quotationId`-referenced — same two-collection design and same 16MB-ceiling reason as `import_batch_rows`. `quotation_rows.coerced` is dot-path keyed to the `Item` schema so the commit step writes it straight through. The 34 standard line-item columns (CZ item#, vendor item#, silver price/gram, weights, stone info, plating, measurements, costs, price, material, stamp, date, image) are defined once in [`src/lib/quote-import/fields.ts`](src/lib/quote-import/fields.ts). Any column beyond those 34 is kept as a **custom field** — `coerced.__custom` is a `{ label: text }` map of the row's unrecognized columns, written to `Item.customFields` at commit (later row wins per label, blanks skipped). On the manual "new quote" page these are **quote-level custom columns** — define a column once and every item row shows it; on file import they're per-row, whatever the sheet carried. Column names that collide with a standard field, and spreadsheet-noise headers (`Column3`, `__EMPTY`, blank), are ignored.

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

**Full 41-column mapping, 2026-09-11.** The real Master File header row (confirmed directly from screenshots of the live sheet) is far richer than the original 20-odd column aliases handled: `SKU, Date added, Title, Description, TITLE#2, descripton #2, Variation sku, variation titles, variation description, Total Weight, silver weight, main stone info/color/type, Stone info/color/type/setting, Pearl Size/type, Plating, All Length+Extender, measurements, clasp, Length of post, Push back Size, Thickness of chain, brand, all specs, Metal, Discontinue, Gender, tcw, Date, MSRP, Date, NEW MSRP, Rue Price, catogry, total carat weight added up already, upc, birthstone`. Two real problems this creates for a plain header-text lookup: the sheet has **two columns both literally labeled "Date"** (one next to MSRP, one next to NEW MSRP), and **two structurally-identical stone groups** ("main stone info/color/type" vs. the general "Stone info/color/type/setting") whose column labels overlap heavily. A lookup keyed by lowercased header text alone cannot tell these apart, and a second occurrence of "Date" would silently overwrite the first in a plain object.

[`parseMasterFile.ts`](src/lib/import/parseMasterFile.ts) was rewritten around a `COLUMNS` array — one entry per real column, **in spreadsheet order** — so every column is resolved by **position** (sheet column N ↔ `COLUMNS[N-1]`) whenever that position's header still matches the reference layout, falling back to header-text matching only for a column whose position has drifted (so a reordered-but-same-columns sheet still imports). This is what lets the two "Date" columns and the two stone groups land in the right place instead of colliding. New `Item` fields: `title2`, `description2` (from `TITLE#2` / `descripton #2`). Everything else that doesn't correspond to an existing top-level field lands under `specs.*` — `specs` is already `strict:false`, so this required no schema change beyond the two title fields — covering the variation-SKU group, both stone groups, pearl, the measurement/finding group (length+extender, post length, push-back size, chain thickness, clasp), `allSpecs`, `totalCaratWeight`, and a `discontinuedFlag` boolean (the sheet's "Discontinue" column — kept apart from `status`, since the lifecycle already models "discontinued" as a status value; this flag just surfaces the sheet's own marker for a reviewer to act on rather than silently dropping it, the same failure mode `brand`/`upc` had before those were added). The second "Date"/NEW MSRP pair is stored as `specs.newMsrpDate` since its authority relative to the primary MSRP date wasn't confirmed — not folded into `pricingHistory` on a guess.

**Manual catalog entry carries the same fields.** `CatalogItemCreateSchema` and `/catalog/new` ([`NewCatalogItemForm.tsx`](src/app/catalog/new/NewCatalogItemForm.tsx)) were widened to match — every Master File column that isn't itself the SKU/pricing/plating base fields is available as a form field, grouped into collapsible sections (Variation info; Weight & stones; Measurements & findings), so an item added by hand carries the same information one that came through the import would. Fields that vary per variation (stone info, measurements, clasp, weight, etc.) can be set once on the base item and overridden per variation row; a variation left blank inherits the base value rather than defaulting to empty.

**Not changed:** the five-check `masterRecordComplete` completeness gate (§6) — by design, per the decision that these fields should be capturable and available without becoming a new blocking requirement.

**Verification.** A synthetic `.xlsx` built with the exact real header row and two real sample rows (including one row with a populated rest-stone group and a "Y" Discontinue flag) was run through the live upload → bulk-approve → commit pipeline: both "Date" columns resolved to their correct targets (`pricing.effectiveDate` vs. `specs.newMsrpDate`), both stone groups landed separately (`specs.mainStoneInfo/Color` vs. `specs.restStoneInfo/Color/Type`), `NEW MSRP` correctly superseded `MSRP` in the committed `pricingHistory` entry (existing `PRICING_FIELD_MAP` behavior, unchanged), and the Discontinue column coerced to `specs.discontinuedFlag` correctly per row. A manual catalog item with a base row and one `-GP` variation confirmed field inheritance (shared fields like weight and main-stone-info identical on both rows) and per-variant override (plating and stone color differing) both work. Test data removed after.

## 5a. Vendor Quote Intake (2026-09-10)

The legacy import (§5) is a one-time migration of the historical Master File. Quote intake is the ongoing counterpart: how a **new** vendor quote enters the system, either as a file the vendor sent or typed in by hand. It reuses the §5 staged-review pattern deliberately — parse, stage, review with inline correction, then commit — rather than inventing a second one.

It lives under **Purchase Orders**, not Items: a quote is a vendor-pipeline artifact (one quote, one vendor, many line items) that *produces* items rather than being one. Three buttons on `/purchase-orders` and `/purchase-orders/quotes`: **New quote manually**, **Import quote file**, **View all quotes**.

**The line-item shape.** One list — [`src/lib/quote-import/fields.ts`](src/lib/quote-import/fields.ts) — defines the 34 columns of a quote line (CZ item#, vendor item#, silver price/gram, total & silver weight, main/rest stone info·color·type, plating & plating type, the BR&NEC length/extender/size measurements, ring size, clasp, post length, push-back size, chain thickness, labor cost/gram, qty, labor & silver cost totals, price, total price, total PO, material, stamp, confirmation date, and an image field). That one definition drives the file parser's header matching, the manual-entry form, and the review editor, so the three stay in lockstep. Each field declares where it lands on the `Item` document (dot-path) and its type, which picks the coercion rule.

**Image field.** Captured as a fixed note — `"working on it"` — on every row, file or manual, and never written to the `Item`. Directory-select → automatic SharePoint upload following the §7 folder structure is a separate, later piece of work.

**File path.** `POST /api/quotations` (multipart) accepts `.xlsx` (via `exceljs`) or `.csv` (via a small dependency-free RFC-4180 reader, [`parseCsv.ts`](src/lib/quote-import/parseCsv.ts) — quoted fields, embedded commas/newlines, `""` escaping, UTF-8 BOM). **Legacy `.xls` (Excel 97-2003) is deliberately rejected** with a clear "open in Excel and Save As .xlsx or .csv first" message: `exceljs` can't read it, and the alternative reader (SheetJS/`xlsx` on npm) carries unpatched prototype-pollution and ReDoS CVEs that PROJECT-REPORT.md §2 rules out for an untrusted-upload handler. The header row is **auto-detected** — the parser scans the first 3 rows and picks the one matching the most known column names, so a blank or title row above the headers (as in the real 23337 sheet, whose headers are on row 2) is handled. Headers are then matched by name against the field list's aliases, so the sheet can be in the vendor's own column order and layout. Every cell is coerced by its field's type — money coercion strips currency markers (`US$`, `USD`, `$`, `€`, …) and thousands separators; a value that won't coerce (a non-numeric price, an impossible date like `13/25/2026`) is flagged with the raw value kept, exactly as §5 does. **Row identity:** the CZ item number if present, otherwise the vendor's own item number — many quote sheets (23337 included) carry no CZ number, it's assigned in a later step — a row is only flagged when it has neither.

**Manual path.** `/purchase-orders/quotes/new` — vendor/PO-ref/received-date/season header plus repeatable item rows (Add item / Remove), every field from the same list. `POST /api/quotations` (JSON) runs the typed values through the *same* coercion server-side so a hand-typed bad date is flagged just like a file one.

**Data model.** `quotations` (extended from the schema stub) + a new `quotation_rows` collection — one small document per line item, `quotationId`-referenced, for the same 16MB-ceiling reason `import_batch_rows` exists. A quotation carries `source` (`file_upload`/`manual`), the vendor, optional file name / PO ref / season, a `status` (`parsing → needs_review → reviewed → committed`), summary counters, and `itemIds` linking the items its commit produced.

**Review + commit.** `/purchase-orders/quotes/[id]` — filter tabs (flagged / needs-review / all), inline correction of any field (a fixed flag clears itself), per-row approve/reject, bulk-approve of all unflagged rows. **Commit** writes approved rows into `items` as `status: "quoted"`, one `pricingHistory` entry per row with `source: "quotation_import"`, vendor copied from the quotation. Rows are grouped by identity: rows sharing a CZ item number merge into one item (later row wins on scalars, pricing appends), and a CZ number that already exists in `items` merges into that document rather than colliding on the unique index. Rows with only a vendor item number are matched to an existing item on `(vendorId, vendorSku)` where `itemNumber` is still unset, and a newly-created one leaves `itemNumber` unset for the later CZ-assignment step — so two such rows can't collide on the sparse unique index, and the same SKU from a *different* vendor stays a separate item. Commit is re-runnable — committed rows are skipped — and batched (one `Item.find` per identity namespace, one `bulkWrite`) like the §5 commit.

**Merge-safety fix during build.** The first cut of the commit step built each field-set as a fresh nested object and `Object.assign`-ed it onto the target — which meant writing a partial path like `specs.ringSize` onto an existing item **replaced its whole `specs` subdocument**, wiping `specs.weight`, `specs.metal`, etc. Caught in end-to-end testing (re-import an existing item touching only ring size → its weight vanished). Fixed with a deep-set helper ([`applyToItem.ts`](src/lib/quote-import/applyToItem.ts)) that creates intermediate objects but never replaces an existing one. Re-verified: partial re-import now leaves untouched nested fields intact. The legacy §5 commit has the same latent shape but is masked there because those rows always carry the full spec set; noted for a follow-up.

**Verification.** Full flow exercised against the live database and removed afterward. Manual path: 3-item quote (one row deliberately flagged) → bulk-approve took exactly the 2 clean rows → inline-fix the flagged row's value (flag cleared) → approve → commit created 3 `quoted` items with specs/pricing mapped correctly; `.xlsx` upload with a duplicate CZ number → the two duplicate rows merged into one item, later row's values winning, two pricing entries; re-commit returned `committed: 0` (idempotent); re-import of an existing item merged in place preserving untouched fields; unauthenticated `POST` → 401; empty `items` / malformed `vendorId` → 400 with field errors. Real-format path: a rebuilt copy of the 23337 sheet (blank row 1, headers on row 2, no CZ number column, `US$`-prefixed prices) uploaded as `.xlsx` → header row auto-detected, prices coerced, 3 items created keyed on vendor item number with `itemNumber` left unset; re-importing one vendor SKU for the same vendor merged in place, the same SKU under a different vendor created a separate item; the legacy binary `.xls` is rejected up front with the save-as guidance.

## 6. Master Record Completion Gate (Phase 5)

An item can't be considered ready for marketplace export until its record is genuinely complete. [`src/lib/masterRecordComplete.ts`](src/lib/masterRecordComplete.ts) defines the exact rule, recomputed automatically on every relevant update (item edits and legacy-import commits alike):

An item is "complete" only when **all** of the following are true:
- Permanent item number is assigned
- Category is set
- Metal spec is set
- At least one MSRP price entry exists
- All three image subfolders (main, sides, models) have at least one image

## 6a. The Catalog — the finalized company database (2026-09-10)

`/catalog` is the **verified, finalized product database** — not a view of the pipeline. It shows only
items with `inCatalog: true`:

- **Master File imports** and **hand-added items** are in the catalog directly (`origin: master_file`
  / `manual`, `catalogApproval.status: "approved"` — the import is by definition the finalized DB, and
  a person with catalog rights added the manual one deliberately).
- **Quote-committed items** (`origin: quotation`) are **not** in the catalog. Once such an item's
  master record is complete, someone with `marketplace_listing` rights hits **"Submit to catalog"** on
  its detail page (`POST /api/items/[id]/submit-to-catalog`, guarded on `isMasterRecordComplete`); it
  enters as `inCatalog: true` with `catalogApproval.status: "pending"`, and an **admin approves** it
  (`POST /api/catalog/[id]/approve`) before it counts as finalized.

**Table** — compact, no horizontal scroll: **SKU · Title · Category · Brand · Plating · UPC · MSRP ·
Variation?**. SKU links to the full item detail. The old wide "Missing" column is replaced by a
**warning icon** on the right ([`CatalogRowFlags.tsx`](src/app/catalog/CatalogRowFlags.tsx), a small
self-contained popover) that opens on click to list exactly which of the five completeness checks
fail. Filter tabs: **All · Incomplete only · Pending approval · Show only variations**.

**Filtering / search / sort** ([`CatalogFilters.tsx`](src/app/catalog/CatalogFilters.tsx), a client
form that pushes to URL params; the server component does the work). A debounced **search** box
(`q` — case-insensitive across SKU, title, brand, UPC), **Category** and **Plating** dropdowns
(options are `Item.distinct(...)` over the catalog), a **MSRP min/max** range, and a **Sort by**
select (SKU A–Z / Z–A, Title, MSRP low→high / high→low, Recently updated). MSRP filter and sort need
the last `pricingHistory` entry, so the query is a single aggregation: `$match` → `$addFields`
(`latestMsrp: {$last: "$pricingHistory.msrp"}`) → optional price `$match` → `$facet` (paged rows +
count) with the numeric-ordering collation. All params compose with the tabs and survive pagination.

**Variations** — same design, hyphen-suffixed SKU: `A1234`, `A1234-GP`, `A1234-RP`; rings carry a
size segment: `R1234-GP-6`, `R1234-6`. Each variation is its **own** `Item` row (own `itemNumber`,
`upc`, images, plating) — the catalog does **not** merge them. `Item` gains `baseSku` (text before the
first hyphen — [`src/lib/catalog/sku.ts`](src/lib/catalog/sku.ts), kept in sync by a pre-save hook)
and `variantSuffix`; alphabetical SKU sort naturally clusters a family, and the "Show only variations"
filter (`variantSuffix != null`) isolates the suffixed rows. A **"Variation?"** column shows Yes/No +
the suffix.

**Manual add** — `/catalog/new` (`marketplace_listing` + admin), `POST /api/catalog` with
`CatalogItemCreateSchema`: a base SKU plus a repeatable variations block
(`{ suffix, plating?, upc?, msrp? }`). Rejects a hyphen in the base SKU and any duplicate `itemNumber`.

**New `Item` fields**: `title`, `description`, `bulletFeatures` (listing copy), `brand`, `upc`,
`baseSku`, `variantSuffix`, `origin`, `inCatalog`, `catalogApproval`, `catalogSubmittedAt`. `title` /
`description` / `brand` / `upc` / `bulletFeatures` are also editable via `PATCH /api/items/[id]`.

**Bug fixed in passing**: the Master File import writes `brand` and `upc`, but the `Item` root schema
is strict and had no such fields — **both were silently dropped on every import to date**. Adding the
schema fields makes them persist (the import's `setDotPath` already emitted them). A one-time
`Item.updateMany` backfill can re-flag existing imported items as `inCatalog` / set `baseSku` if the
current DB's items should appear immediately — documented, not run.

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
| 3b | Sample-purchasing intake pipeline — vendor proposal file attach, two-stage approval (image review + "molly's approval"), Pass/Done-Ordered outcome, permanent item/box number assignment | **Partly addressed 2026-09-10** — vendor quote intake (file upload `.xlsx`/`.csv` + manual multi-item entry) with staged parse → review → commit is built and verified (§5a). The two-stage approval, Pass/Done-Ordered outcome, and box-number assignment parts of 3b are still not started. Image-from-directory → SharePoint upload is deferred (§13). |
| 4 | Receiving + photography + SharePoint image pipeline | **Done** — SharePoint credentials received 2026-09-01, image pipeline built and verified live same day. Receiving log + warehouse QC screens (content/packaging checks) still to build. |
| 5 | Master DB completion gate | **Done** — plus the Catalog rebuilt 2026-09-10 as the finalized company database (`inCatalog` filter, admin approval for quote items, variations as separate rows, manual `/catalog/new` entry). See §6a. |
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

### Can quotes / items sync to Monday.com? — feasibility (2026-09-10)

**Short answer: yes, the same way POs already do — it's a bounded piece of work, not a research question.** Everything the PO sync is built on is generic and already in place; nothing new needs to be figured out at the protocol level.

**What already exists and would be reused unchanged:**
- [`client.ts`](src/lib/monday/client.ts) — the GraphQL wrapper (auth header, Monday's HTTP-200-with-`errors` quirk). Board-agnostic.
- The `mondayItemId` idempotency pattern — `items.mondayItemId` **already exists on the schema** (added alongside the PO field, currently unused). First push does `create_item` and stores the returned id; every later push does `change_multiple_column_values` on that id. No duplicates.
- `sync_logs` with `run_type` — a `monday_push` run type is already defined; a per-item or per-quote run logs the same way.
- The bounded-concurrency helper (`mapWithConcurrency`, 4-at-a-time) for a bulk push, and the "sync now" endpoint + preview/apply UI pattern from the PO side.

**What would need to be built (all mechanical, mirroring [`sync.ts`](src/lib/monday/sync.ts) / [`config.ts`](src/lib/monday/config.ts)):**
1. **An items board id + column-id map.** The single hard dependency — someone with board access supplies the target board's id and the column ids for each field to push (Monday's column ids are opaque strings like `dropdown1`, `numbers`, `date4`, captured once from the board, exactly as [`MONDAY_COLUMN_IDS`](src/lib/monday/config.ts) was for the PO board). Without this there's nothing to write to; with it, the rest is a day's work.
2. **`syncItemToMonday(item)`** — a near-copy of `syncPurchaseOrderToMonday`: build a `column_values` object from the item's fields via the map, create-or-update by `mondayItemId`, stamp `lastPushedToMondayAt`.
3. **A value map per Monday status/dropdown column** — the PO sync needed `STATUS_TO_MONDAY_LABEL` because Monday status columns take a label string, not a raw value. Any status/dropdown column on the items board needs the same small lookup table, and the same "unmapped label → logged, not guessed" discipline (§12's vocabulary-gap note applies identically).
4. **A trigger** — `POST /api/items/[id]/monday-sync` for a per-item button and/or `POST /api/monday/sync-items` for a bulk run, admin-gated, logged. Per the blueprint's async-trigger rule (already followed on the PO side), this is never called synchronously inside the request that edited the item — it's a deliberate action or a background job.

**Quote-specific options, once item→Monday exists:**
- **Push each committed item** — a quote's `commit` already produces `items` with `quotation_import` provenance; a follow-on step (or the same admin bulk run) pushes those items to the board. Simplest, and reuses everything above verbatim.
- **Push the quote itself as a board item** — only if Monday has (or gets) a "quotes"/"sample purchasing" board that mirrors §4a. That needs its own board id + column map; the code shape is still the same `create_item`/`change_multiple_column_values` pattern.

**Not needed / not recommended:** a live two-way quote↔Monday binding. The established pattern here is one-way push + a separate, explicit, preview-then-apply pull (§12 "Inbound pull") — a quote intake would follow the same model if inbound quote data on Monday ever needs to come back.

## 13. Known Open Items

- **MongoDB Atlas connection string contains a live credential** (`rafe:rafe123`) that was shared in plaintext during setup. It has not yet been rotated. This should be changed in Atlas and the `.env.local` file updated, at your convenience — the string is correctly excluded from version control in the meantime.
- **Monday.com and SharePoint credentials were also shared in plaintext** (via chat, 2026-09-01). Both are stored only in `.env.local`, which is gitignored and was never committed — but as with the Mongo credential, rotating them at your convenience once the integration is settled is good hygiene.
- **Local DNS resolution issue** (§10, item 6) — intermittently prevents connecting to MongoDB Atlas from this machine. Needs a decision on remedy.
- **Seeded role accounts** (`*@example.com`, one per role) all have the same demo password, `demo1234!`, set 2026-09-01 for client demo purposes. There is still no self-service password-reset flow — changing a password requires a direct DB update.
- **No pagination on the import-review screen** — the 16MB document-size crash (§10 item 11) is fixed and batches of any size now insert correctly, but the review table still renders every staged row client-side at once. A batch in the low thousands of rows (what's been seen from real usage so far) is fine; tens of thousands of rows would be sluggish to review in the browser even though the backend handles it. Worth adding if larger files become routine.
- **No upload size/row-count cap** — nothing currently stops an arbitrarily large file from being uploaded and parsed in memory in one request. Not a data-corruption risk after the §10 item 11 fix, but a resource-exhaustion one worth guarding against with a sane cap and a clear rejection message.
- **Monday.com status vocabulary gap** (§12) — roughly 20 real board-status labels have no equivalent in this app's `PoStatus` enum. Worth a conversation with Joel; not currently blocking anything.
- **Marketplace export files don't yet replicate dropdown validation from real templates** — generated Macy's/Belk/Kohl's/Target files match every column exactly but don't carry the Excel data-validation pick-lists and conditional formatting from your native templates. Adding these is technically straightforward (exceljs supports it) but requires listing which columns have restricted values and what those values are.
- **Quote intake — image field is a placeholder** (§5a) — every parsed/entered line item gets a fixed `"working on it"` note in the image field; it's never written to the `Item`. The intended replacement is directory-select in the browser → automatic SharePoint upload following the §7 folder structure, deferred by decision to a later piece of work.
- **Quote intake — item→Monday.com sync not built** — a committed quote produces `items` but nothing pushes them to a Monday board. Feasibility and the exact work involved are written up at the end of §12; the one external dependency is an items board id + column-id map from someone with board access.
- **`applyToItem` deep-merge fix not yet back-ported to the §5 legacy-import commit** — the same "partial dot-path replaces the whole subdocument" bug exists in [`import-review/[batchId]/commit`](src/app/api/admin/import-review/[batchId]/commit/route.ts), currently masked because Master File rows always carry the full spec set. Low risk today; worth aligning the two commit paths on the shared helper.

## 14. Visual Design System & UI Audit (2026-09-09)

A full redesign and rebrand from "PIM 2.0" to "CZC PIM," completed 2026-09-09, migrating the entire app onto Tailwind CSS (from ad hoc inline styles) and introducing a polished, consistent visual identity.

A full pass over everything built so far, requested to confirm three things before client presentation: the DB schema is fully covered, every API endpoint actually works, and the UI for completed phases is presentation-ready.

- **DB:** all 11 collections re-read against the blueprint field-by-field — confirmed correct. `ReceivingLog`, `Shipment`, `PlatformTemplate` are scaffolded-but-unused, which is expected (they belong to phases not yet built), not a defect. (`Quotation` is no longer in that list — it was extended and put to use by the 2026-09-10 quote-intake feature, §5a, which also added the `quotation_rows` collection.)
- **API:** all 15 non-Monday endpoints verified working via direct handler invocation against the real database with a mocked session (Monday's two write endpoints were deliberately excluded from this pass to honor "don't disturb the real board" — they were already verified live in §12). 23/23 checks passed, including a direct confirmation that the checklist hard gate (§8, §10 item 3) actually blocks and then allows the `ready_to_ship` transition.
- **UI:** every real authenticated page (Items, Item detail, Purchase Orders, PO detail, Payables, Catalog, Import Review + batch review, Login, Unauthorized) was rebuilt on a shared design system — CSS custom-property tokens for a light/dark-aware palette, Fraunces/Inter/IBM Plex Mono type pairing, Lucide icons throughout, and shared components (`Card`, `Pill`, `Button`, `Field`) — replacing the original plain inline-styled HTML. This is the same design language used for the `/present` client-demo build described elsewhere in this history. Verified end-to-end via real authenticated HTTP requests, not just a build check.
- This pass is also where bugs 7–10 in §10 were found and fixed.

## 15. What This Document Is For

This is meant to be a living reference — as further requirements, corrections, or new phases come up, they can be added here and then implemented against. If anything above is inaccurate, incomplete, or has changed since this was written, flag it and it'll be corrected before further work builds on it.
