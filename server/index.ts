import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { adminProducts } from "./schema";
import { getDemoAdminData, getDemoSeedRecords, DEMO_PREFIX_VALUE } from "./seed-data";
import { storage, adminStorage } from "./storage";
import { syncRecords } from "./schema";
import { eq, and } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use(router);

const isDev = process.env.NODE_ENV !== "production";

if (!isDev) {
  const publicDir = path.resolve(__dirname, "../dist/public");
  app.use(express.static(publicDir));
  // ponytail: regex, not "*" — Express 5 rejects bare wildcard strings
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "5000", 10);
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
      status TEXT NOT NULL DEFAULT 'completed',
      customer_name TEXT NOT NULL DEFAULT '',
      lines_json JSONB NOT NULL,
      closed_at BIGINT,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    )
  `);
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

async function autoSeedIfEmpty() {
  const existing = await db.select({ id: adminProducts.id }).from(adminProducts).limit(1);
  if (existing.length > 0) return;

  console.log("No admin data found — auto-seeding demo data…");

  const clientCode = "demo-client";
  const client = await storage.getOrCreateClient(clientCode, "Demo Client");
  const seedRecordsList = getDemoSeedRecords();

  await db.transaction(async (tx) => {
    for (const record of seedRecordsList) {
      const exists = await tx
        .select()
        .from(syncRecords)
        .where(
          and(
            eq(syncRecords.clientId, client.id),
            eq(syncRecords.tableName, record.tableName),
            eq(syncRecords.recordId, record.recordId),
          )
        )
        .limit(1);

      if (exists.length === 0) {
        await tx.insert(syncRecords).values({
          clientId: client.id,
          tableName: record.tableName,
          recordId: record.recordId,
          data: record.data,
          updatedAt: record.updatedAt,
          deletedAt: record.deletedAt,
        });
      }
    }
  });

  const adminData = getDemoAdminData();
  for (const p of adminData.products) {
    await adminStorage.createProduct(p as unknown as Record<string, unknown>);
  }
  for (const v of adminData.variants) {
    await adminStorage.createVariant(v as unknown as Record<string, unknown>);
  }
  for (const ii of adminData.inventoryItems) {
    await adminStorage.createInventoryItem(ii as unknown as Record<string, unknown>);
  }
  for (const mg of adminData.modifierGroups) {
    await adminStorage.createModifierGroup(mg as unknown as Record<string, unknown>);
  }
  for (const m of adminData.modifiers) {
    await adminStorage.createModifier(m as unknown as Record<string, unknown>);
  }
  for (const b of adminData.bomEntries) {
    await adminStorage.createBom(b as unknown as Record<string, unknown>);
  }
  const pmgByProduct = new Map<string, typeof adminData.productModifierGroups>();
  for (const pmg of adminData.productModifierGroups) {
    const arr = pmgByProduct.get(pmg.productId) || [];
    arr.push(pmg);
    pmgByProduct.set(pmg.productId, arr);
  }
  for (const [productId, pmgs] of pmgByProduct) {
    await adminStorage.setProductModifierGroups(productId, pmgs.map(p => p.modifierGroupId));
    for (const pmg of pmgs) {
      if (pmg.scaleFactors) {
        await adminStorage.setProductModifierGroupScaleFactors(productId, pmg.modifierGroupId, pmg.scaleFactors);
      }
    }
  }

  console.log("Auto-seed complete: sync records + admin tables populated");
}

initDb()
  .then(() => autoSeedIfEmpty())
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
