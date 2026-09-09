# PIM (Product Inventory Management)

Next.js + MongoDB replacement for the Master File spreadsheet and Monday.com boards. See the full architecture writeup in the PIM System Blueprint artifact for the reasoning behind every model here.

## What's in this scaffold

- **`src/models/`** — Mongoose models for all 10 collections in the blueprint: `Item`, `PurchaseOrder`, `Vendor`, `Quotation`, `Shipment`, `ReceivingLog`, `Payment`, `SyncLog`, `PlatformTemplate`, `User`.
- **`src/lib/enums.ts`** — every status/enum value used across the models, as the single source of truth (item lifecycle, PO pipeline, back-office checklist, QC results, payment tranches, roles).
- **`src/lib/db.ts`** — cached Mongoose connection singleton for Next.js's hot-reload/serverless environment.
- **`src/lib/auth.ts`** + **`src/middleware.ts`** — NextAuth credentials login with a `role` claim on the session/JWT, and route-prefix gating matching the roles table in the blueprint (§7).
- **`src/app/api/health/route.ts`** — confirms the DB connection works once `MONGODB_URI` is set.
- **`src/scripts/seed-admin.ts`** — creates the first administrator account.

No feature screens yet — this is the foundation. Next steps land per the phase plan in the blueprint (Phase 2: legacy import-review UI).

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in MONGODB_URI and NEXTAUTH_SECRET at minimum
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=changeme npm run seed:admin
npm run dev
```

Visit `/api/health` to confirm the Mongo connection is live.

## Not yet configured

- **Monday.com sync** — needs `MONDAY_API_TOKEN`, not yet built (blueprint §5).
- **SharePoint image storage** — needs Graph API credentials (to be supplied); folder-convention logic in the blueprint §Image Storage isn't implemented yet.
- **Marketplace export** — `PlatformTemplate` model exists but is empty; needs the sample format files for Shopify/Amazon/Macy's before real column mappings can be entered.
