# Fuel Station POS

## Overview
Full-stack fuel station point-of-sale application built with React + Express + SQLite. Designed to work entirely locally on iPad/iPhone.

## Architecture
- **Frontend**: React 18 + TypeScript, Vite, TanStack Query, Wouter routing, shadcn/ui components, Framer Motion
- **Backend**: Express.js on port 5000, serves both API and static frontend
- **Database**: SQLite via better-sqlite3 + Drizzle ORM, stored at `./data/pos.db`
- **No PostgreSQL** — the app uses SQLite exclusively for offline/local operation

## Data Model
- `products` — catalog items (fuel types, shop items) with type (RETAIL/RESTAURANT) and JSON attributes (tags, tax_exempt)
- `variants` — SKU-level pricing (e.g., "Per Litre" variant of Regular 91 at $1.85)
- `modifier_groups` — groupings for modifiers (selection rules in JSON)
- `modifiers` — individual modifiers with pricing logic
- `inventory_items` — raw materials/stock with current_quantity and tracking_config JSON (low_stock_alert)
- `bill_of_materials` — links variants to inventory items with quantity_deducted per sale
- `employees` — staff with role, pay_rate, and PIN access
- `time_punches` — clock in/out records
- `sales` — completed transactions with lines_json

## Key Files
- `shared/schema.ts` — Drizzle SQLite table definitions and Zod schemas
- `server/db.ts` — SQLite connection, DDL, and seed data
- `server/storage.ts` — Full CRUD storage layer using Drizzle ORM
- `server/routes.ts` — REST API endpoints (`/api/products`, `/api/variants`, etc.)
- `client/src/lib/store.tsx` — TanStack Query-backed store provider
- `client/src/lib/api.ts` — Fetch API client
- `drizzle.config.ts` — SQLite Drizzle config

## Pages
- `/` — Onboarding/getting started
- `/pos` — Point of sale register
- `/products` — Tabbed view: Station Menu, Bill of Materials, Bulk Inventory
- `/employees` — Staff management
- `/reports` — Sales trends, product mix, inventory status
- `/integrations` — Third-party connections (mock)
- `/settings` — Tax rate configuration

## Seed Data
5 products (Regular 91, Premium 95, Ultimate 98, Diesel, Bottled Water), 5 variants, 5 inventory items, 7 BOM entries, 2 employees
