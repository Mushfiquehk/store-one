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
- `sales` — completed transactions with native `linesJson: SaleLine[]`

### Server-side (PostgreSQL / Drizzle)
- `clients` — registered POS terminal instances (id, code, name, created_at)
- `backups` — full JSON snapshots of a client's IndexedDB data (id, client_id, snapshot JSONB, created_at)
- `sync_records` — incremental sync records (id, client_id, table_name, record_id, data JSONB, updated_at BIGINT, deleted_at BIGINT); unique on (client_id, table_name, record_id)

### Admin-side (PostgreSQL / Drizzle) — dedicated tables for server-side data management
- `admin_products`, `admin_variants`, `admin_modifier_groups`, `admin_product_modifier_groups`, `admin_modifiers`, `admin_inventory_items`, `admin_bill_of_materials`, `admin_invoices`, `admin_invoice_line_items`
- Mirror the client-side Dexie schema but live in PostgreSQL with proper typed columns
- Each record has `updatedAt` (bigint epoch ms) and `deletedAt` (bigint, nullable) for soft-delete
- Full CRUD via `/api/admin/*` endpoints

## Sync System

### Categories
- `menu` → products, variants, modifierGroups, productModifierGroups, modifiers
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
- **Dexie migration history**: v1 (initial), v2, v3 (JSON parsing), v4 (rekey scale factors), v5 (add updatedAt/deletedAt indexes)
- **productModifierGroups sync uses `${productId}::${modifierGroupId}` as recordId** for compound key serialization

## Key Files
- `client/src/lib/db.ts` — Dexie.js database definition with IndexedDB schema and migrations (v1–v5)
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
- `server/storage.ts` — Server-side storage interface using Drizzle (backup + sync + admin CRUD operations)
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
- `POST /api/dev/seed` — (Dev only) Seed coffee shop demo data into both sync_records and admin tables (products, variants, modifiers, inventory, BOM, PMGs, ~350 sales). Optional body: `{ "clientCode": "my-client" }` (defaults to "dev-seed"). Returns `{ success, clientCode, recordsInserted, recordsUpdated, totalRecords, adminRecords }`.
- `POST /api/dev/clear` — (Dev only) Delete all `demo_*` records from sync_records and all admin tables. Returns `{ success, recordsDeleted, adminTablesCleared }`.

## Pages
- `/` — POS register
- `/start` — Onboarding/getting started
- `/products` — Station Menu, Modifiers, Bill of Materials, Bulk Inventory
- `/employees` — Staff management
- `/reports` — Sales trends, product mix, inventory status
- `/integrations` — Third-party connections (placeholder)
- `/settings` — Tax rate, Incremental Sync (per-category controls + auto-sync), Full Backup & Restore
- `/admin` — Admin dashboard with tabbed interface: Dashboard (metrics + clients), Products (reuses POS components via AdminStoreProvider), Invoice Intake, and Interactive Sync

## Schema Migrations
This project does not use automated schema migration tooling. When the data shape changes (modifications to `shared/schema.ts` types or `client/src/lib/db.ts` Dexie schema), all local and server data should be wiped and recreated:

1. **Clear IndexedDB**: In the browser DevTools → Application → IndexedDB, delete the `CornerPOS` database (or clear site data).
2. **Reset PostgreSQL**: Run `npx drizzle-kit push` to recreate server tables, or drop and recreate the database if needed.
3. **Re-seed demo data**: Call `POST /api/dev/seed` to populate the sync_records table with demo data, then sync from a client to pull it down. Alternatively, use the `/demo` page UI to seed data directly into IndexedDB on the client side.
4. **Clear demo data**: Call `POST /api/dev/clear` to remove all demo-prefixed records (`demo_*`) from the server sync_records table.

## Development
- Workflow runs: `concurrently "vite dev --host 0.0.0.0 --port 5000" "npx tsx server/index.ts"`
- Vite proxies `/api` to Express on port 3001
- PostgreSQL database provisioned via Replit (DATABASE_URL env var)
