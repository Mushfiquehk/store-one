import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes";
import { db } from "./db";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use(router);

const isDev = process.env.NODE_ENV !== "production";

if (!isDev) {
  const publicDir = path.resolve(__dirname, "../dist/public");
  app.use(express.static(publicDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "3001", 10);
const serverPort = isDev ? 3001 : port;

async function initDb() {
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
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
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
}

initDb()
  .then(() => {
    app.listen(serverPort, "0.0.0.0", () => {
      console.log(`Server running on port ${serverPort}`);
    });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to initialize database:", message);
    process.exit(1);
  });
