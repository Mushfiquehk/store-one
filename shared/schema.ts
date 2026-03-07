import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  isComposite: integer("is_composite", { mode: "boolean" }).notNull().default(false),
  attributes: text("attributes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const variants = sqliteTable("variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").unique(),
  name: text("name").notNull(),
  basePrice: integer("base_price").notNull(),
  directInventoryId: text("direct_inventory_id"),
  config: text("config"),
});

export const modifierGroups = sqliteTable("modifier_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(0),
  selectionRules: text("selection_rules"),
});

export const productModifierGroups = sqliteTable("product_modifier_groups", {
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  modifierGroupId: text("modifier_group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
  scaleFactors: text("scale_factors"),
});

export const modifiers = sqliteTable("modifiers", {
  id: text("id").primaryKey(),
  modifierGroupId: text("modifier_group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseUpcharge: integer("base_upcharge").notNull().default(0),
  scaleFactor: text("scale_factor"),
  pricingLogic: text("pricing_logic"),
  inventoryItemId: text("inventory_item_id"),
  quantityPerUse: real("quantity_per_use"),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull(),
  currentQuantity: real("current_quantity").notNull().default(0),
  trackingConfig: text("tracking_config"),
});

export const billOfMaterials = sqliteTable("bill_of_materials", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull().references(() => inventoryItems.id),
  quantityDeducted: real("quantity_deducted").notNull(),
  scaleFactorMatrix: text("scale_factor_matrix"),
  overrideModifierGroupId: text("override_modifier_group_id"),
});

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  payRate: integer("pay_rate").notNull(),
  pin: text("pin").notNull(),
});

export const timePunches = sqliteTable("time_punches", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  timeIn: integer("time_in").notNull(),
  timeOut: integer("time_out"),
});

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull(),
  linesJson: text("lines_json").notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ createdAt: true });
export const insertVariantSchema = createInsertSchema(variants);
export const insertModifierGroupSchema = createInsertSchema(modifierGroups);
export const insertModifierSchema = createInsertSchema(modifiers);
export const insertInventoryItemSchema = createInsertSchema(inventoryItems);
export const insertBomSchema = createInsertSchema(billOfMaterials);
export const insertEmployeeSchema = createInsertSchema(employees);
export const insertTimePunchSchema = createInsertSchema(timePunches);
export const insertSaleSchema = createInsertSchema(sales);

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Variant = typeof variants.$inferSelect;
export type InsertVariant = z.infer<typeof insertVariantSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type BillOfMaterials = typeof billOfMaterials.$inferSelect;
export type InsertBom = z.infer<typeof insertBomSchema>;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type TimePunch = typeof timePunches.$inferSelect;
export type InsertTimePunch = z.infer<typeof insertTimePunchSchema>;
export type Sale = typeof sales.$inferSelect;
export type InsertSale = z.infer<typeof insertSaleSchema>;
