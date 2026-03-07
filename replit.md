# Fuel Station POS

## Overview
Full-stack fuel station point-of-sale application built with React + Express + SQLite. Designed to work entirely locally on iPad/iPhone. Supports both simple retail (1:1 SKU) and complex composite/restaurant items with modifiers, BOM recipes, and product-specific modifier pricing.

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
- `modifiers` — individual options with `inventory_item_id` (assigned ingredient) and `quantity_per_use` (deduction amount). `base_upcharge` column exists but defaults to 0 — pricing is now set per-product, not on the modifier itself.
- `product_modifier_groups` — many-to-many link between products and modifier groups, with `scale_factors` TEXT column storing per-product modifier prices as JSON: `{ modifierId: { variantName: priceInCents } }`. Values are absolute prices in cents, not multipliers.
- `inventory_items` — raw materials/stock with current_quantity and tracking_config JSON
- `bill_of_materials` — links variants/modifiers to inventory items with `quantity_deducted`, `scale_factor_matrix` JSON, and `override_modifier_group_id` (recipe override feature)
- `employees` — staff with role, pay_rate, and PIN access
- `time_punches` — clock in/out records
- `sales` — completed transactions with `lines_json` (includes full modifier tree)

## Key Files
- `shared/schema.ts` — Drizzle SQLite table definitions and Zod schemas
- `server/db.ts` — SQLite connection, DDL, and seed data (seeding disabled)
- `server/storage.ts` — Full CRUD storage layer using Drizzle ORM
- `server/routes.ts` — REST API endpoints (`/api/products`, `/api/variants`, etc.)
- `client/src/lib/store.tsx` — TanStack Query-backed store provider with all CRUD operations
- `client/src/lib/api.ts` — Fetch API client
- `client/src/components/product-wizard.tsx` — 5-step progressive disclosure wizard for product creation
- `client/src/components/modifier-selector.tsx` — POS modifier selection dialog with product-specific pricing
- `client/src/pages/modifiers.tsx` — Modifier group & option management UI (no pricing — pricing is per-product)
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
- **Retail vs Prepared Dichotomy**: Retail items use 3-step path (Item Type → Inventory → Review); Prepared items trigger full 5-step wizard
- **Product-Specific Modifier Pricing**: Modifier prices are set per product, not globally on the modifier. Stored on `product_modifier_groups.scale_factors` as `{ modifierId: { variantName: priceInCents } }`. The modifier creation form has no price field — pricing is configured in the product wizard (step 4) and product editor (Modifiers tab).
- **Auto-Scale BOM**: Define base recipe for one size, proportionally scale to other sizes
- **POS Modifier Selection**: Composite items prompt modifier selection with min/max validation
- **Modifier Ingredient Assignment**: Each modifier option can have an inventory item + quantity per use; POS deducts via BOM entries first, then falls back to modifier's own inventoryItemId
- **Recipe Override by Modifier Group**: BOM entries can be linked to a modifier group via `overrideModifierGroupId`. When a modifier from that group is selected at POS, the BOM entry's ingredient deduction is skipped (the modifier's own ingredient handles it). Configured in both product editor (Recipes tab) and product wizard (Modifiers step → Recipe Overrides section).
- **Wizard Modifier Pricing Grid**: When assigning an existing modifier group during product creation, two grids appear: (1) pricing grid ($ per modifier per variant) and (2) ingredient quantity grid for modifiers with assigned ingredients
- **Price Calculation**: P_final = P_variant + Σ(productModifierPrice[modId][variantName])

## CRUD Capabilities
- **Tags**: View all tags with product counts, remove tag from all products at once (Menu page → Tags button)
- **Products**: Create (wizard), Edit (name/tags), Delete (with dependency warnings for sales, BOM)
- **Variants**: Edit (name/SKU/price), Delete (with BOM warning, last-variant guard deletes product)
- **Modifier Groups**: Create, Edit (name/rules), Delete (with confirmation)
- **Modifiers**: Create, Edit (name/ingredient), Delete (with confirmation). No price field — pricing is per-product.
- **Product-Modifier Pricing**: Configure $ prices per modifier per variant and ingredient quantities per size via slider icon on the product editor (Modifiers tab)
- **Inventory Items**: Create, Edit (name/unit/low stock alert), Delete (with warnings for BOM/modifier/variant references)

## Seed Data
Auto-seeding is disabled. Database starts empty.
