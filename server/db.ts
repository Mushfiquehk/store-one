import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const dbPath = path.resolve("data", "pos.db");

import fs from "fs";
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

function initTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      is_composite INTEGER NOT NULL DEFAULT 0,
      attributes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      base_price INTEGER NOT NULL,
      direct_inventory_id TEXT,
      config TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      min_selections INTEGER NOT NULL DEFAULT 0,
      max_selections INTEGER NOT NULL DEFAULT 0,
      selection_rules TEXT
    );

    CREATE TABLE IF NOT EXISTS product_modifier_groups (
      product_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      PRIMARY KEY (product_id, modifier_group_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      modifier_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      base_upcharge INTEGER NOT NULL DEFAULT 0,
      scale_factor TEXT,
      pricing_logic TEXT,
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit_of_measure TEXT NOT NULL,
      current_quantity REAL NOT NULL DEFAULT 0,
      tracking_config TEXT
    );

    CREATE TABLE IF NOT EXISTS bill_of_materials (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      quantity_deducted REAL NOT NULL,
      scale_factor_matrix TEXT,
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pay_rate INTEGER NOT NULL,
      pin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_punches (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      time_in INTEGER NOT NULL,
      time_out INTEGER,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      tax_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL,
      lines_json TEXT NOT NULL
    );
  `);
}

function seedIfEmpty() {
  const count = sqlite.prepare("SELECT COUNT(*) as c FROM products").get() as { c: number };
  if (count.c > 0) return;

  const insertProduct = sqlite.prepare("INSERT INTO products (id, name, type, is_composite, attributes) VALUES (?, ?, ?, ?, ?)");
  const insertVariant = sqlite.prepare("INSERT INTO variants (id, product_id, sku, name, base_price, direct_inventory_id, config) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertInventory = sqlite.prepare("INSERT INTO inventory_items (id, name, unit_of_measure, current_quantity, tracking_config) VALUES (?, ?, ?, ?, ?)");
  const insertBom = sqlite.prepare("INSERT INTO bill_of_materials (id, source_type, source_id, inventory_item_id, quantity_deducted) VALUES (?, ?, ?, ?, ?)");
  const insertEmployee = sqlite.prepare("INSERT INTO employees (id, name, role, pay_rate, pin) VALUES (?, ?, ?, ?, ?)");

  const txn = sqlite.transaction(() => {
    insertProduct.run("prod_91", "Regular 91", "RETAIL", 0, JSON.stringify({ tax_exempt: false, tags: ["petrol", "fuel"] }));
    insertProduct.run("prod_95", "Premium 95", "RETAIL", 0, JSON.stringify({ tax_exempt: false, tags: ["petrol", "premium", "fuel"] }));
    insertProduct.run("prod_98", "Ultimate 98", "RETAIL", 0, JSON.stringify({ tax_exempt: false, tags: ["petrol", "premium", "fuel"] }));
    insertProduct.run("prod_diesel", "Diesel", "RETAIL", 0, JSON.stringify({ tax_exempt: false, tags: ["diesel", "fuel"] }));
    insertProduct.run("prod_water", "Bottled Water", "RETAIL", 0, JSON.stringify({ tax_exempt: false, tags: ["shop", "beverage"] }));

    insertInventory.run("inv_petrol_base", "Unleaded Petrol Base", "L", 50000, JSON.stringify({ low_stock_alert: 10000 }));
    insertInventory.run("inv_diesel_base", "Diesel Base", "L", 40000, JSON.stringify({ low_stock_alert: 8000 }));
    insertInventory.run("inv_octane_booster", "Octane Booster", "L", 5000, JSON.stringify({ low_stock_alert: 1000 }));
    insertInventory.run("inv_synthetic_oil", "Full Synthetic Oil", "bottle", 100, JSON.stringify({ low_stock_alert: 20 }));
    insertInventory.run("inv_water", "Spring Water 500ml", "each", 200, JSON.stringify({ low_stock_alert: 50 }));

    insertVariant.run("var_91_per_l", "prod_91", "FUEL-91", "Per Litre", 185, "inv_petrol_base", null);
    insertVariant.run("var_95_per_l", "prod_95", "FUEL-95", "Per Litre", 205, "inv_petrol_base", null);
    insertVariant.run("var_98_per_l", "prod_98", "FUEL-98", "Per Litre", 225, "inv_petrol_base", null);
    insertVariant.run("var_diesel_per_l", "prod_diesel", "FUEL-DSL", "Per Litre", 195, "inv_diesel_base", null);
    insertVariant.run("var_water_500", "prod_water", "SH-WTR", "500ml", 250, "inv_water", JSON.stringify({ size: "500ml" }));

    insertBom.run("bom_91", "VARIANT", "var_91_per_l", "inv_petrol_base", 1);
    insertBom.run("bom_95_petrol", "VARIANT", "var_95_per_l", "inv_petrol_base", 0.95);
    insertBom.run("bom_95_octane", "VARIANT", "var_95_per_l", "inv_octane_booster", 0.05);
    insertBom.run("bom_98_petrol", "VARIANT", "var_98_per_l", "inv_petrol_base", 0.90);
    insertBom.run("bom_98_octane", "VARIANT", "var_98_per_l", "inv_octane_booster", 0.10);
    insertBom.run("bom_diesel", "VARIANT", "var_diesel_per_l", "inv_diesel_base", 1);
    insertBom.run("bom_water", "VARIANT", "var_water_500", "inv_water", 1);

    insertEmployee.run("emp_1", "Manager", "manager", 2500, "1234");
    insertEmployee.run("emp_2", "Attendant", "staff", 1500, "0000");
  });

  txn();
}

initTables();
seedIfEmpty();
