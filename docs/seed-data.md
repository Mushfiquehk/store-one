# Seed Data Guide

## Overview

CornerPOS ships with a comprehensive coffee shop demo dataset in `client/src/lib/seed-data.ts`. It populates every table in the database with realistic, interconnected records that exercise all POS features.

## Using Seed & Deseed

### From the UI (Client-side)

Navigate to `/demo` in the browser. Two buttons are available:

- **Seed Demo Data** — inserts the full demo dataset into IndexedDB (or re-seeds if already present)
- **Clear** — removes all demo records without affecting user-created data

### From the Server (Dev Endpoints)

The server has dev-only endpoints that seed/clear both sync_records and admin tables:

```bash
# Seed all demo data (sync_records + admin tables)
curl -X POST http://localhost:3001/api/dev/seed

# Seed with a specific client code
curl -X POST http://localhost:3001/api/dev/seed -H "Content-Type: application/json" -d '{"clientCode": "my-pos"}'

# Clear all demo data from both sync_records and admin tables
curl -X POST http://localhost:3001/api/dev/clear
```

### From Code (Client-side)

```ts
import { seedDemoData, clearDemoData, isDemoDataSeeded } from "@/lib/seed-data";

// Check if demo data exists
const hasDemo = await isDemoDataSeeded();

// Insert demo data (automatically clears existing demo data first)
await seedDemoData();

// Remove all demo data
await clearDemoData();
```

### How Isolation Works

Every demo record uses an ID prefix of `demo_`. The `clearDemoData()` function removes only records whose IDs start with `demo_`, so user-created data is never touched. `seedDemoData()` calls `clearDemoData()` internally before inserting, making it safe to call repeatedly.

Both `server/seed-data.ts` and `client/src/lib/seed-data.ts` produce the same coffee shop dataset. The server seed populates `sync_records` (for client pull during sync) and admin tables (for admin panel display). The client seed populates IndexedDB directly.

---

## What the Demo Data Includes

| Category | Products | Features Exercised |
|---|---|---|
| Espresso Drinks | Latte, Cappuccino, Americano, Mocha (S/M/L) | Sub-recipe chaining (Espresso Shot), scale factor matrices, milk override modifier groups, product-specific modifier pricing |
| Specialty | Matcha Latte, Chai Latte, Hot Chocolate (S/M/L) | BOM scaling per variant, milk modifier overrides |
| Cold Drinks | Iced Latte, Cold Brew (S/M/L) | Ice ingredient tracking, optional "Splash of Milk" modifier group (min 0) |
| Bakery | Blueberry Muffin, Cookie, Croissant, Bagel, Bagel w/ Cream Cheese | Single-variant composite items with ingredient recipes |
| Sandwiches | Turkey Club, Ham & Swiss, Avocado Toast | Bread choice modifier group, fixed recipes |
| Retail | Bottled Water, Bag of Coffee Beans (12oz/1lb), Travel Mug | Direct inventory mapping, sized retail variants |
| Ingredients | 36 inventory items | Low stock thresholds, last purchase prices, various units of measure |
| Staff | 4 employees | Manager, baristas, cashier roles with PIN access |
| Time Punches | 15 days of shifts | Weekday/weekend variation |
| Sales | ~350 orders over 15 days | Deterministic (seeded RNG), varied products/modifiers/payment methods, weekend peaks |

---

## Deseeding Before Schema Changes

**Always clear demo data before modifying the Dexie schema.** Dexie migrations run on the stored data, and leftover demo records with outdated shapes can cause migration errors or corrupt data.

### Steps

1. Open `/demo` in the browser and click **Clear**, or call `clearDemoData()` programmatically.
2. Verify the database is clean: `isDemoDataSeeded()` should return `false`.
3. Make your schema changes in `client/src/lib/db.ts` (bump the version number, add the `.upgrade()` handler).
4. Restart the dev server so the new Dexie version initializes.
5. Update the seed data to match the new schema (see next section).
6. Re-seed with the updated data.

If you skip step 1 and the migration fails, you can always delete the IndexedDB database entirely from the browser DevTools (Application > IndexedDB > cornerpos > Delete database) and start fresh.

---

## Updating Seed Data After Schema Changes

When you add, rename, or remove fields from any entity interface in `db.ts`, the seed data arrays must be updated to match. Follow this checklist:

### 1. Update the static data arrays

Each entity type has a corresponding array at the top of `seed-data.ts`. Add or remove fields on every record in the affected array.

**Example — adding a `color` field to `Product`:**

```ts
// db.ts — updated interface
export interface Product {
  // ... existing fields ...
  color: string | null;  // NEW
}

// seed-data.ts — update every product record
const products: Product[] = [
  { id: `${D}prod_latte`, name: "Latte", /* ... */, color: null },
  // ... all other products ...
];
```

### 2. Update the order templates (if SaleLine changed)

The `orderPool` array defines order templates used by `generateSales()`. If you change the `SaleLine` type in `shared/schema.ts`, update the template shape and the `generateSales()` function that builds `SaleLine` objects.

### 3. Update the `clearDemoData()` transaction

If you add a new Dexie table that holds demo records:
- Add the table to the transaction's table list
- Add a deletion block for records with the `demo_` prefix
- If the table uses a compound primary key (like `productModifierGroups`), handle it with a filter-and-delete pattern instead of `where("id")`

### 4. Update the `seedDemoData()` transaction

Add `db.newTable.bulkPut(newArray)` inside the transaction.

### 5. Update the demo page description

Update the bullet list in `client/src/pages/demo.tsx` so users know what the demo includes.

### 6. Verify

- Run `npx tsc --noEmit` to catch type mismatches
- Seed from the `/demo` page
- Spot-check a few pages (POS, Products, Inventory, Reports) to confirm data renders correctly
- Clear and re-seed to confirm round-trip works

---

## Architecture Notes

- **Deterministic order generation**: `generateSales()` uses a seeded PRNG (`seededRandom(42)`) so the same orders are produced every time. This makes it possible to write assertions against specific sale totals or counts.
- **Weight-based item selection**: Each `OrderTemplate` has a `weight` that controls how frequently it appears in generated orders. Lattes are weighted highest, travel mugs lowest — mimicking real coffee shop volume.
- **ID conventions**: All IDs follow the pattern `demo_{type}_{descriptor}` (e.g., `demo_prod_latte`, `demo_var_latte_m`, `demo_inv_espresso_beans`). Helper functions `V()`, `MG()`, `MOD()`, `B()` generate variant, modifier group, modifier, and BOM IDs respectively.
