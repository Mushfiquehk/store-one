# Fuel Station POS

## Overview
Full-stack fuel station point-of-sale application built with React + Express + SQLite. Designed to work entirely locally on iPad/iPhone. Supports both simple retail (1:1 SKU) and complex composite/restaurant items with modifiers, BOM recipes, and size-scaled pricing per the unified POS architecture paper.

## Architecture
- **Frontend**: React 19 + TypeScript, Vite, TanStack Query, Wouter routing, shadcn/ui components, Framer Motion
- **Backend**: Express.js on port 5000, serves both API and static frontend
- **Database**: SQLite via better-sqlite3 + Drizzle ORM, stored at `./data/pos.db`
- **No PostgreSQL** — the app uses SQLite exclusively for offline/local operation
- **Headless/Composable**: Backend handles pricing logic, inventory BOM traversal; frontend abstracts complexity via Wizard pattern

## Data Model
- `products` — catalog items with `type` (RETAIL/RESTAURANT), `is_composite` flag, and JSON `attributes` (tags, tax_exempt)
- `variants` — SKU-level pricing with `direct_inventory_id` for 1:1 retail mapping
- `modifier_groups` — groupings for modifiers with `min_selections` / `max_selections` constraints
- `modifiers` — individual options with `base_upcharge` (cents), `inventory_item_id` (assigned ingredient), and `quantity_per_use` (deduction amount). Legacy `scale_factor` column exists but is no longer used for new data.
- `product_modifier_groups` — many-to-many link between products and modifier groups, with `scale_factors` TEXT column storing per-product size pricing multipliers as JSON: `{ modifierId: { variantName: factor } }`
- `inventory_items` — raw materials/stock with current_quantity and tracking_config JSON
- `bill_of_materials` — links variants/modifiers to inventory items with `quantity_deducted`, `scale_factor_matrix` JSON, and `override_modifier_group_id` (recipe override feature)
- `employees` — staff with role, pay_rate, and PIN access
- `time_punches` — clock in/out records
- `sales` — completed transactions with `lines_json` (includes full modifier tree)

## Key Files
- `shared/schema.ts` — Drizzle SQLite table definitions and Zod schemas
- `server/db.ts` — SQLite connection, DDL, and seed data
- `server/storage.ts` — Full CRUD storage layer using Drizzle ORM
- `server/routes.ts` — REST API endpoints (`/api/products`, `/api/variants`, etc.)
- `client/src/lib/store.tsx` — TanStack Query-backed store provider with all CRUD operations
- `client/src/lib/api.ts` — Fetch API client
- `client/src/components/product-wizard.tsx` — 5-step progressive disclosure wizard for product creation
- `client/src/components/modifier-selector.tsx` — POS modifier selection dialog with size-scaled pricing
- `client/src/pages/modifiers.tsx` — Modifier group & option management UI
- `drizzle.config.ts` — SQLite Drizzle config

## Pages
- `/` — POS register (with modifier selection for composite items)
- `/start` — Onboarding/getting started
- `/products` — Tabbed view: Station Menu (with Wizard), Modifiers, Bill of Materials, Bulk Inventory
- `/employees` — Staff management
- `/reports` — Sales trends, product mix, inventory status
- `/integrations` — Third-party connections (mock)
- `/settings` — Tax rate configuration

## Frontend Patterns (per Research Paper)
- **Wizard Design Pattern**: Product creation uses 5-step progressive disclosure (Item Type → Variants → Recipes → Modifiers → Review)
- **Retail vs Prepared Dichotomy**: Retail items use quick-add path; Prepared items trigger full wizard
- **Size-Scaled Pricing**: Modifier upcharges scale by variant size via product-level scale factors stored on `product_modifier_groups.scale_factors`. Configured per product-modifier-group link, not on the modifier itself.
- **Auto-Scale BOM**: Define base recipe for one size, proportionally scale to other sizes
- **POS Modifier Selection**: Composite items prompt modifier selection with min/max validation
- **Modifier Ingredient Assignment**: Each modifier option can have an inventory item + quantity per use; POS deducts via BOM entries first, then falls back to modifier's own inventoryItemId
- **Recipe Override by Modifier Group**: BOM entries can be linked to a modifier group via `overrideModifierGroupId`. When a modifier from that group is selected at POS, the BOM entry's ingredient deduction is skipped (the modifier's own ingredient handles it). Configured in both product editor (Recipes tab) and product wizard (Modifiers step → Recipe Overrides section).
- **Wizard Modifier Size Grid**: When assigning an existing modifier group during product creation, two grids appear: (1) pricing multipliers grid (modifier options × product sizes) for scale factors, and (2) ingredient quantity grid for modifiers with assigned ingredients
- **Price Calculation**: P_final = P_variant + Σ(U_modifier × S_price_matrix)

## CRUD Capabilities
- **Products**: Create (wizard), Edit (name/tags), Delete (with dependency warnings for sales, BOM)
- **Variants**: Edit (name/SKU/price), Delete (with BOM warning, last-variant guard deletes product)
- **Modifier Groups**: Create, Edit (name/rules), Delete (with confirmation)
- **Modifiers**: Create, Edit (name/price/ingredient), Delete (with confirmation)
- **Product-Modifier Scale Factors**: Configure size pricing multipliers and ingredient quantities per size via slider icon — available on both the Modifiers page (per linked product) and the product editor (Modifiers tab, per linked group)
- **Inventory Items**: Create, Edit (name/unit/low stock alert), Delete (with warnings for BOM/modifier/variant references)

## Seed Data
5 products (Regular 91, Premium 95, Ultimate 98, Diesel, Bottled Water), 5 variants with direct_inventory_id, 5 inventory items, 7 BOM entries, 2 employees
