import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Create every table and column the server needs, idempotently.
 *
 * Lifted out of index.ts so it can be called without starting a listener — a sync test
 * needs the schema, not a web server. index.ts still calls it on boot; nothing about when
 * or how it runs has changed.
 */
export async function initDb() {
  // One writer at a time. Two processes running this concurrently — two server instances
  // booting, or two test files opening the same database — race inside CREATE TABLE IF NOT
  // EXISTS and one of them fails on a duplicate pg_type entry. The lock is released when the
  // session ends even if this throws, so a crashed boot cannot wedge the next one.
  await db.execute(sql`SELECT pg_advisory_lock(8262614)`);
  try {
    await initSchema();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(8262614)`);
  }
}

async function initSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      snapshot JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sync_records (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT,
      UNIQUE(client_id, table_name, record_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'RETAIL',
      is_composite BOOLEAN NOT NULL DEFAULT false,
      available_as_ingredient BOOLEAN NOT NULL DEFAULT false,
      attributes JSONB,
      created_at TEXT,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      sku TEXT,
      name TEXT NOT NULL,
      base_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      direct_inventory_id TEXT,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_modifier_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      min_selections INTEGER NOT NULL DEFAULT 0,
      max_selections INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_product_modifier_groups (
      product_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      scale_factors JSONB,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT,
      UNIQUE(product_id, modifier_group_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_modifiers (
      id TEXT PRIMARY KEY,
      modifier_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      base_upcharge DOUBLE PRECISION NOT NULL DEFAULT 0,
      inventory_item_id TEXT,
      quantity_per_use DOUBLE PRECISION,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit_of_measure TEXT NOT NULL DEFAULT 'each',
      current_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
      low_stock_threshold DOUBLE PRECISION,
      last_purchase_price DOUBLE PRECISION,
      purchase_unit TEXT,
      units_per_purchase DOUBLE PRECISION NOT NULL DEFAULT 1,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  // CREATE TABLE IF NOT EXISTS does nothing to a database that already has the table, so new
  // columns need their own statement. The DEFAULT backfills existing rows to today's behaviour.
  await db.execute(sql`ALTER TABLE admin_inventory_items ADD COLUMN IF NOT EXISTS purchase_unit TEXT`);
  await db.execute(sql`ALTER TABLE admin_inventory_items ADD COLUMN IF NOT EXISTS units_per_purchase DOUBLE PRECISION NOT NULL DEFAULT 1`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_bill_of_materials (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      source_product_id TEXT,
      quantity_deducted DOUBLE PRECISION NOT NULL DEFAULT 0,
      scale_factor_matrix JSONB,
      override_modifier_group_id TEXT,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_invoices (
      id TEXT PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded',
      notes TEXT NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_invoice_line_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
      unit_price_cents DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  // Missing from this bootstrap until Feature 7 T2, though storage.ts and bom-engine.ts both
  // write to it — on a fresh database every sales write failed with "relation does not exist".
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_sales (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      combo_discount_cents INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'test',
      tendered_cents INTEGER,
      change_cents INTEGER,
      is_test_order BOOLEAN NOT NULL DEFAULT FALSE,
      tax_rate_pct DOUBLE PRECISION,
      tax_inclusive BOOLEAN,
      status TEXT NOT NULL DEFAULT 'completed',
      customer_name TEXT NOT NULL DEFAULT '',
      lines_json JSONB NOT NULL,
      closed_at BIGINT,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
  // Feature 16 T2: cash tender, for databases that already had admin_sales. These ALTERs must
  // come *after* the CREATE above — they sat before it for one commit, and on a fresh database
  // initDb() threw "relation admin_sales does not exist" and the server never finished booting.
  await db.execute(sql`ALTER TABLE admin_sales ADD COLUMN IF NOT EXISTS tendered_cents INTEGER`);
  await db.execute(sql`ALTER TABLE admin_sales ADD COLUMN IF NOT EXISTS change_cents INTEGER`);
  // Feature 26 T4: test orders, so a recipe check cannot be counted as revenue.
  await db.execute(sql`ALTER TABLE admin_sales ADD COLUMN IF NOT EXISTS is_test_order BOOLEAN NOT NULL DEFAULT FALSE`);
  // Feature 21 T4: the rate stamped on the sale. Nullable — an old row's rate is unknown.
  await db.execute(sql`ALTER TABLE admin_sales ADD COLUMN IF NOT EXISTS tax_rate_pct DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE admin_sales ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schedule_shifts (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_minutes INTEGER NOT NULL,
      end_minutes INTEGER NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
}
