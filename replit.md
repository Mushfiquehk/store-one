# CornerPOS

## Overview
Offline-first point-of-sale application built with React + Dexie.js (IndexedDB). Features a central backup server so multiple POS terminals can upload/restore their local data, an admin dashboard showing aggregated metrics, and incremental per-category sync with auto-sync support.

## Architecture
- **Frontend**: React 19 + TypeScript, Vite, Dexie.js (IndexedDB), Wouter routing, shadcn/ui components, Framer Motion
- **Backend**: Express server on port 3001 (dev), PostgreSQL via Drizzle ORM for backup storage and sync records
- **Database**: IndexedDB via Dexie.js for local POS data; PostgreSQL for server-side backup snapshots and sync records
- **Dev setup**: Vite on port 5000 proxies `/api` requests to Express on port 3001; both run via `concurrently`
- **Production**: Express serves built static files and API routes from a single process
- **Offline-first**: All POS operations read/write directly to IndexedDB. Backup/restore is snapshot-based; incremental sync is per-category.

## Data Model

### Client-side (IndexedDB / Dexie.js)
All entities include `updatedAt: number` (epoch ms timestamp) and `deletedAt: number | null` for soft-delete support.
- `products` — catalog items with `type: "RETAIL" | "RESTAURANT"`, `isComposite`, `availableAsIngredient`, native `attributes: ProductAttributes | null`
- `variants` — SKU-level pricing with `directInventoryId`
- `modifierGroups` — groupings for modifiers with min/max selection constraints
- `modifiers` — individual options with `inventoryItemId` and `quantityPerUse`
- `productModifierGroups` — many-to-many link with native `scaleFactors: ModifierScaleFactors | null`; compound key `[productId+modifierGroupId]`
- `inventoryItems` — raw materials/stock with `currentQuantity` and `lowStockThreshold`
- `billOfMaterials` (BomEntry) — links variants/modifiers to inventory items with quantity deduction and scale factors
- `employees` — staff with role, payRate, and PIN access
- `timePunches` — clock in/out records
- `sales` — completed transactions with native `linesJson: SaleLine[]`, `customerName`, `closedAt` (null = open order), and `comboDiscountCents`
- `combos` — combo definitions with `name`, `pricingStrategy` ("FIXED" | "DISCOUNT_VALUE" | "DISCOUNT_PERCENT"), pricing fields (`fixedPriceCents`, `discountValueCents`, `discountPercent`), and `active` flag
- `comboItems` — items belonging to a combo; each references a `comboId` and one of `productId`, `variantId`, or `productGroupId`
- `productGroups` — named collections of products/variants (e.g., "Any Hot Drink")
- `productGroupItems` — members of a product group; each references `productGroupId` and one of `productId` or `variantId`

### Server-side (PostgreSQL / Drizzle)
- `clients` — registered POS terminal instances (id, code, name, created_at)
- `backups` — full JSON snapshots of a client's IndexedDB data (id, client_id, snapshot JSONB, created_at)
- `sync_records` — incremental sync records (id, client_id, table_name, record_id, data JSONB, updated_at BIGINT, deleted_at BIGINT); unique on (client_id, table_name, record_id)

### Admin-side (PostgreSQL / Drizzle) — dedicated tables for server-side data management
- `admin_products`, `admin_variants`, `admin_modifier_groups`, `admin_product_modifier_groups`, `admin_modifiers`, `admin_inventory_items`, `admin_bill_of_materials`, `admin_invoices`, `admin_invoice_line_items`, `admin_sales`
- Mirror the client-side Dexie schema but live in PostgreSQL with proper typed columns
- Each record has `updatedAt` (bigint epoch ms) and `deletedAt` (bigint, nullable) for soft-delete
- Full CRUD via `/api/admin/*` endpoints with Zod validation, pagination/filtering, and `{ data, meta? }` response envelopes
- API reference documentation at `docs/api-reference.md`

## Sync System

### Categories
- `menu` → products, variants, modifierGroups, productModifierGroups, modifiers, combos, comboItems, productGroups, productGroupItems
- `ingredients` → inventoryItems, billOfMaterials
- `sales` → sales

### Sync Flow
1. Client collects local records changed since `lastSyncedAt` (using `updatedAt` index)
2. Sends changes to `POST /api/sync/:category` with `clientCode` and `lastSyncedAt`
3. Server applies client changes (last-write-wins by `updatedAt`), returns any server-side changes the client is missing
4. Client applies server changes locally, updates `lastSyncedAt` cursor

### Auto-Sync
- Configurable interval (default 15 minutes) stored in localStorage (`cornerpos_auto_sync_interval`)
- Toggle stored in localStorage (`cornerpos_auto_sync`)
- Syncs all categories on each tick

### Soft Deletes
- All CRUD operations use soft deletes (`deletedAt = Date.now()`) instead of hard deletes
- Cascade soft deletes propagate to related entities (e.g., deleting a product soft-deletes its variants, PMG links, and BOM entries)
- Live queries in `store.tsx` filter out soft-deleted records via `.filter(r => !r.deletedAt)`

## Key Conventions
- **Scale factor keys use variant IDs**, not variant names
- **All stringified JSON fields have been eliminated** — native objects/arrays throughout
- **SaleLine includes denormalized names** captured at sale time
- **SaleLine includes combo tracking fields**: `comboId`, `comboName`, `originalPriceCents`, `finalPriceCents` for reporting
- **Dexie migration history**: v1 (initial), v2, v3 (JSON parsing), v4 (rekey scale factors), v5 (add updatedAt/deletedAt indexes), v6 (add customerName/closedAt to sales), v7 (add combos, comboItems, productGroups, productGroupItems tables + comboDiscountCents on sales)
- **productModifierGroups sync uses `${productId}::${modifierGroupId}` as recordId** for compound key serialization

## Key Files
- `client/src/lib/db.ts` — Dexie.js database definition with IndexedDB schema and migrations (v1–v7)
- `client/src/lib/local-storage.ts` — CRUD storage layer for all entities (with soft deletes and updatedAt stamping)
- `client/src/lib/store.tsx` — React context provider using Dexie live queries (filters soft-deleted records)
- `client/src/lib/sync.ts` — Client-side sync service (syncCategory, syncAll, startAutoSync, stopAutoSync)
- `client/src/lib/seed-data.ts` — Coffee shop demo data: 21 products, 36 ingredients, 5 modifier groups, 4 employees, ~350 orders across 15 days
- `docs/seed-data.md` — Seed/deseed usage, schema change workflow, and seed data update checklist
- `shared/schema.ts` — TypeScript type definitions for all entities + SYNC_CATEGORY_TABLES mapping
- `server/index.ts` — Express server entry point with DB initialization (creates clients, backups, sync_records tables)
- `server/schema.ts` — Drizzle ORM schema for clients, backups, and sync_records tables
- `server/routes.ts` — API routes for backup, restore, clients list, admin metrics, incremental sync, and dev seed/clear endpoints
- `server/seed-data.ts` — Server-side demo data definitions for dev seed endpoint
- `server/bom-engine.ts` — Server-side BOM-based inventory deduction engine (extracted from POS client logic), test order processing
- `server/storage.ts` — Server-side storage interface using Drizzle (backup + sync + admin CRUD operations)
- `client/src/pages/combos.tsx` — Combo management UI: ProductGroupManager + ComboEditor with pricing strategy config and item picker
- `client/src/lib/admin-store.tsx` — AdminStoreProvider that exposes the same StoreContextType as useStore() but backed by fetch() to /api/admin/ endpoints
- `client/src/components/admin-invoice-intake.tsx` — Invoice intake UI for admin section
- `client/src/components/interactive-sync.tsx` — Interactive sync UI with diff comparison and per-item accept/reject
- `server/db.ts` — PostgreSQL connection pool and Drizzle instance
- `vite.config.ts` — Vite configuration with `/api` proxy to Express

## API Endpoints
- `POST /api/backup` — Upload a full data snapshot (clientCode + snapshot JSON)
- `GET /api/backup/:clientCode` — Get latest backup snapshot for a client
- `GET /api/clients` — List all registered clients with last backup timestamps
- `GET /api/admin/metrics` — Aggregated metrics across all client backups
- `GET/POST/PUT/DELETE /api/admin/products` — Admin product CRUD
- `GET/POST/PUT/DELETE /api/admin/variants` — Admin variant CRUD
- `GET/POST/PUT/DELETE /api/admin/modifier-groups` — Admin modifier group CRUD
- `GET/POST/PUT/DELETE /api/admin/modifiers` — Admin modifier CRUD
- `GET/POST/PUT/DELETE /api/admin/inventory-items` — Admin inventory CRUD
- `POST /api/admin/inventory-items/:id/adjust` — Adjust inventory quantity
- `GET/POST/PUT/DELETE /api/admin/bom` — Admin bill of materials CRUD
- `GET/POST/PUT/DELETE /api/admin/invoices` — Admin invoice CRUD
- `POST /api/admin/invoices/with-line-items` — Create invoice with line items (updates inventory)
- `GET/POST/PUT/DELETE /api/admin/invoice-line-items` — Admin invoice line item CRUD
- `GET /api/admin/product-modifier-groups` — List product-modifier group links
- `POST /api/admin/product-modifier-groups/set` — Set product modifier groups
- `POST /api/admin/product-modifier-groups/scale-factors` — Set scale factors
- `GET /api/admin/all-data` — Fetch all admin data for sync comparison
- `POST /api/admin/apply-sync-changes` — Apply sync changes to admin data
- `POST /api/sync/:category` — Push local changes, receive server-side changes (category: menu, ingredients, sales)
- `GET /api/sync/:category/status` — Get sync status for a category (requires ?clientCode query param)
- `POST /api/admin/test-orders` — Place a test order: validates line items, calculates pricing, deducts inventory via BOM logic, persists sale. Returns sale object, per-line pricing, inventory effects (before/after), and warnings.
- `POST /api/admin/test-orders/dry-run` — Same as test-orders but without persisting sale or deducting inventory. Preview mode.
- `GET /api/admin/test-orders` — List all persisted test order sales.
- `GET /api/admin/test-orders/:id` — Get a single test order sale by ID.
- `GET /api/admin/reports/summary` — Aggregate data: sale count, revenue, avg order value, product/variant/inventory counts, low-stock items. Optional `?since=` (unix ms timestamp).
- `GET /api/admin/reports/inventory` — All inventory items with current quantities, low-stock status, last purchase price, and cumulative per-item movement data (BOM-based sales deductions, order counts, invoice additions).
- `POST /api/orders/simulate` — Simulate an order (stub, returns 501 on Express — client-only data)
- `GET /api/reports/sales-summary` — Aggregate sales totals (stub, returns 501 on Express)
- `GET /api/reports/product-mix` — Product mix breakdown by variant (stub, returns 501 on Express)
- `GET /api/reports/inventory-status` — Inventory levels with low-stock flags
- `GET /api/admin/time-punches` — List employee time punches (stub on Express)
- `GET /api/local/status` — Health check for local Capacitor HTTP server
- `POST /api/demo/seed` — Seed coffee shop demo data into both sync_records and admin tables. Optional body: `{ "clientCode": "my-client" }` (defaults to "demo-client"). Returns `{ success, clientCode, recordsInserted, recordsUpdated, totalRecords, adminRecords }`.
- `POST /api/demo/clear` — Delete all `demo_*` records from sync_records and all admin tables. Returns `{ success, recordsDeleted, adminTablesCleared }`.
- `GET /api/schedule/shifts?weekStart=YYYY-MM-DD` — List schedule shifts for a given week
- `POST /api/schedule/shifts` — Create a new shift (id, employeeId, weekStart, dayOfWeek, startMinutes, endMinutes)
- `PUT /api/schedule/shifts/:id` — Update a shift's time or day
- `DELETE /api/schedule/shifts/:id` — Soft-delete a shift
- `POST /api/schedule/copy-week` — Copy shifts from one week to another (`{ fromWeek, toWeek }`)
- `POST /api/schedule/publish` — Send schedule emails to employees with configured SMTP settings
- `GET /api/settings` — Get all store settings
- `GET /api/settings/:key` — Get a single setting by key
- `PUT /api/settings/:key` — Update a setting (`{ value }`)

## Store Settings (PostgreSQL `store_settings` table)
- `hoursOfOperation` — `{ openHour, closeHour, operatingDays[] }` — Defines schedule board time range and visible days
- `emailConfig` — `{ provider, host, port, secure, username, password, senderEmail, senderName }` — SMTP email backend for schedule publishing

## Pages
- `/` — POS register
- `/start` — Onboarding/getting started
- `/products` — Station Menu, Modifiers, Combos, Bill of Materials, Bulk Inventory
- `/employees` — Staff management (name, role, email, PIN)
- `/schedule` — Weekly drag-and-drop employee scheduling with resizable shift blocks, copy-previous-week, and publish-to-email
- `/reports` — Sales trends, product mix, inventory status
- `/integrations` — Third-party connections (placeholder)
- `/settings` — Tax rate, Hours of Operation (open/close hours + operating days), Email Backend (SMTP config with provider presets), Incremental Sync, Full Backup & Restore
- `/admin` — Admin dashboard with tabbed interface: Dashboard (metrics + clients), Products (reuses POS components via AdminStoreProvider), Invoice Intake, and Interactive Sync

## Auto-Seed Demo Data
Both the server and client automatically seed demo data on first launch:
- **Server**: On startup, checks if admin tables are empty. If so, seeds sync_records and all admin tables with the coffee shop dataset.
- **Client**: On first load, checks if IndexedDB has any demo products. If not, seeds the full dataset (products, ingredients, employees, ~350 orders).
- **Removal**: Navigate to `/demo` and click "Clear" to remove all demo data from both client and server. Or call `POST /api/demo/clear` directly.

## Schema Migrations
This project does not use automated schema migration tooling. When the data shape changes (modifications to `shared/schema.ts` types or `client/src/lib/db.ts` Dexie schema), all local and server data should be wiped and recreated:

1. **Clear IndexedDB**: In the browser DevTools → Application → IndexedDB, delete the `CornerPOS` database (or clear site data).
2. **Reset PostgreSQL**: Run `npx drizzle-kit push` to recreate server tables, or drop and recreate the database if needed.
3. **Re-seed demo data**: Call `POST /api/dev/seed` to populate the sync_records table with demo data, then sync from a client to pull it down. Alternatively, use the `/demo` page UI to seed data directly into IndexedDB on the client side.
4. **Clear demo data**: Call `POST /api/dev/clear` to remove all demo-prefixed records (`demo_*`) from the server sync_records table.

## Capacitor / Native iOS App
- Capacitor is configured to wrap the Vite build output (`dist/public`) as a native iOS app
- `capacitor.config.ts` — Capacitor configuration (appId: `com.cornerpos.app`, webDir: `dist/public`)
- To build for iOS: `npm run build` then `npx cap sync` then `npx cap open ios` (requires macOS + Xcode)
- The existing `npm run dev` and `npm run build` workflows are unaffected
- When running as a native Capacitor app, a local HTTP server starts on port 8080, exposing the full admin API surface backed by Dexie (IndexedDB) — no PostgreSQL needed
- An AI agent on the same device can make HTTP requests to `http://localhost:8080/api/admin/*`, `http://localhost:8080/api/orders/simulate`, `http://localhost:8080/api/reports/*`, and `http://localhost:8080/api/local/status`
- Platform detection via `Capacitor.isNativePlatform()` ensures the local server only starts on iOS
- App lifecycle events (foreground/background) manage the local server start/stop
- Native iOS plugin (`ios-plugin/CornerPOSHttpServer/`) uses GCDWebServer to run the HTTP server, registered via `registerPlugin()` from `@capacitor/core`

### Platform-Specific Endpoint Behavior
The following endpoints are **only functional on the local Capacitor server** (backed by Dexie/IndexedDB). On the Express server, they return HTTP 501 because sales, employees, and time punches are stored client-side only and have no corresponding PostgreSQL admin tables:
- `POST /api/orders/simulate` — Creates a sale from variant/modifier selections (local only)
- `GET /api/reports/sales-summary` — Aggregate sales totals (local only)
- `GET /api/reports/product-mix` — Product mix breakdown (local only)

The following endpoint works on **both** Express and local Capacitor servers:
- `GET /api/reports/inventory-status` — Inventory levels with low-stock flags

## PWA Support
- `client/public/manifest.json` — PWA manifest with CornerPOS branding
- `client/public/sw.js` — Service worker for offline caching (stale-while-revalidate for app shell, bypasses `/api/` requests)
- Service worker registered in `client/src/main.tsx`

## Key Files (Capacitor / Local Server)
- `capacitor.config.ts` — Capacitor configuration
- `client/src/lib/local-server.ts` — Local HTTP server module (starts on Capacitor native, no-op in browser)
- `client/src/lib/dexie-admin-storage.ts` — Dexie-backed implementation of ApiAdminStorage for local server
- `shared/api-handlers.ts` — Transport-agnostic API request handlers (used by both Express routes and local server)
- `ios-plugin/CornerPOSHttpServer/` — Native iOS Swift plugin (GCDWebServer-based) implementing the local HTTP server for Capacitor

## Development
- Workflow runs: `concurrently "vite dev --host 0.0.0.0 --port 5000" "npx tsx server/index.ts"`
- Vite proxies `/api` to Express on port 3001
- PostgreSQL database provisioned via Replit (DATABASE_URL env var)
