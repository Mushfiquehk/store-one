# CornerPOS

## Overview
Offline-first point-of-sale application built with React + Dexie.js (IndexedDB). Designed to work entirely in the browser with zero server requirements. Supports both simple retail (1:1 SKU) and complex composite/restaurant items with modifiers, BOM recipes, and product-specific modifier pricing.

## Architecture
- **Frontend-only**: React 19 + TypeScript, Vite, Dexie.js (IndexedDB), Wouter routing, shadcn/ui components, Framer Motion
- **Database**: IndexedDB via Dexie.js — all data stored in the browser, persists across sessions
- **No server**: The app runs entirely client-side. Vite serves as the dev server. Production builds output static files.
- **Offline-first**: All operations read/write directly to IndexedDB. No network calls required.
- **Sync-ready architecture**: The storage layer (`client/src/lib/local-storage.ts`) provides a clean interface that can be extended with a sync adapter for future multi-device support.

## Data Model
- `products` — catalog items with `type` (RETAIL/RESTAURANT), `isComposite` flag, and JSON `attributes` (tags, tax_exempt)
- `variants` — SKU-level pricing with `directInventoryId` for 1:1 retail mapping
- `modifierGroups` — groupings for modifiers with min/max selection constraints
- `modifiers` — individual options with `inventoryItemId` (assigned ingredient) and `quantityPerUse` (deduction amount)
- `productModifierGroups` — many-to-many link between products and modifier groups with `scaleFactors` for per-product pricing
- `inventoryItems` — raw materials/stock with currentQuantity and trackingConfig
- `billOfMaterials` — links variants/modifiers to inventory items with quantity deduction and scale factor matrix
- `employees` — staff with role, payRate, and PIN access
- `timePunches` — clock in/out records
- `sales` — completed transactions with `linesJson` (includes full modifier tree)

## Key Files
- `client/src/lib/db.ts` — Dexie.js database definition with IndexedDB schema
- `client/src/lib/local-storage.ts` — CRUD storage layer for all entities
- `client/src/lib/store.tsx` — React context provider using Dexie live queries for reactive data
- `shared/schema.ts` — TypeScript type definitions for all entities
- `client/src/components/product-wizard.tsx` — 5-step progressive disclosure wizard for product creation
- `client/src/components/modifier-selector.tsx` — POS modifier selection dialog with product-specific pricing
- `vite.config.ts` — Vite configuration for dev and production builds

## Pages
- `/` — POS register (with modifier selection for composite items)
- `/start` — Onboarding/getting started
- `/products` — Tabbed view: Station Menu (with Wizard), Modifiers, Bill of Materials, Bulk Inventory
- `/employees` — Staff management
- `/reports` — Sales trends, product mix, inventory status
- `/integrations` — Third-party connections (placeholder)
- `/settings` — Tax rate configuration

## Frontend Patterns
- **Dexie Live Queries**: All data subscriptions use `useLiveQuery` from `dexie-react-hooks` for automatic reactivity
- **Wizard Design Pattern**: Product creation uses progressive disclosure
- **Product-Specific Modifier Pricing**: Modifier prices stored on `productModifierGroups.scaleFactors`
- **Auto-Scale BOM**: Define base recipe for one size, proportionally scale to other sizes
- **Recipe Override by Modifier Group**: BOM entries can skip deduction when a modifier from a linked group is selected

## Development
- `npm run dev` — Start Vite dev server on port 5000
- `npm run build` — Build static output to `dist/public`
- No database setup required — IndexedDB is created automatically in the browser
