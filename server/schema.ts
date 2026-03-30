import { pgTable, serial, text, timestamp, jsonb, integer, bigint, unique, boolean as pgBoolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syncRecords = pgTable("sync_records", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
}, (table) => [
  unique("sync_records_client_table_record").on(table.clientId, table.tableName, table.recordId),
]);

export const adminProducts = pgTable("admin_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("RETAIL"),
  isComposite: pgBoolean("is_composite").notNull().default(false),
  availableAsIngredient: pgBoolean("available_as_ingredient").notNull().default(false),
  attributes: jsonb("attributes"),
  createdAt: text("created_at"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminVariants = pgTable("admin_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  sku: text("sku"),
  name: text("name").notNull(),
  basePrice: doublePrecision("base_price").notNull().default(0),
  directInventoryId: text("direct_inventory_id"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminModifierGroups = pgTable("admin_modifier_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminProductModifierGroups = pgTable("admin_product_modifier_groups", {
  productId: text("product_id").notNull(),
  modifierGroupId: text("modifier_group_id").notNull(),
  scaleFactors: jsonb("scale_factors"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
}, (table) => [
  unique("admin_pmg_pk").on(table.productId, table.modifierGroupId),
]);

export const adminModifiers = pgTable("admin_modifiers", {
  id: text("id").primaryKey(),
  modifierGroupId: text("modifier_group_id").notNull(),
  name: text("name").notNull(),
  baseUpcharge: doublePrecision("base_upcharge").notNull().default(0),
  inventoryItemId: text("inventory_item_id"),
  quantityPerUse: doublePrecision("quantity_per_use"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminInventoryItems = pgTable("admin_inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("each"),
  currentQuantity: doublePrecision("current_quantity").notNull().default(0),
  lowStockThreshold: doublePrecision("low_stock_threshold"),
  lastPurchasePrice: doublePrecision("last_purchase_price"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminBillOfMaterials = pgTable("admin_bill_of_materials", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  sourceProductId: text("source_product_id"),
  quantityDeducted: doublePrecision("quantity_deducted").notNull().default(0),
  scaleFactorMatrix: jsonb("scale_factor_matrix"),
  overrideModifierGroupId: text("override_modifier_group_id"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminInvoices = pgTable("admin_invoices", {
  id: text("id").primaryKey(),
  supplierName: text("supplier_name").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("recorded"),
  notes: text("notes").notNull().default(""),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const adminInvoiceLineItems = pgTable("admin_invoice_line_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  description: text("description").notNull().default(""),
  quantity: doublePrecision("quantity").notNull().default(0),
  unitPriceCents: doublePrecision("unit_price_cents").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertBackupSchema = createInsertSchema(backups).omit({ id: true, createdAt: true });

export type InsertClient = z.infer<typeof insertClientSchema>;
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Client = typeof clients.$inferSelect;
export type Backup = typeof backups.$inferSelect;
export type SyncRecord = typeof syncRecords.$inferSelect;
