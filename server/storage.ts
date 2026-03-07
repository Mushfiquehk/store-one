import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  products, variants, modifierGroups, productModifierGroups, modifiers,
  inventoryItems, billOfMaterials, employees, timePunches, sales,
  type Product, type InsertProduct,
  type Variant, type InsertVariant,
  type ModifierGroup, type InsertModifierGroup,
  type Modifier, type InsertModifier,
  type InventoryItem, type InsertInventoryItem,
  type BillOfMaterials, type InsertBom,
  type Employee, type InsertEmployee,
  type TimePunch, type InsertTimePunch,
  type Sale, type InsertSale,
} from "@shared/schema";

export interface IStorage {
  getProducts(): Product[];
  getProduct(id: string): Product | undefined;
  createProduct(data: InsertProduct): Product;
  updateProduct(id: string, data: Partial<InsertProduct>): Product | undefined;
  deleteProduct(id: string): void;

  getVariants(productId?: string): Variant[];
  getVariant(id: string): Variant | undefined;
  createVariant(data: InsertVariant): Variant;
  updateVariant(id: string, data: Partial<InsertVariant>): Variant | undefined;
  deleteVariant(id: string): void;

  getModifierGroups(): ModifierGroup[];
  createModifierGroup(data: InsertModifierGroup): ModifierGroup;
  updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): ModifierGroup | undefined;
  deleteModifierGroup(id: string): void;

  getProductModifierGroups(productId: string): string[];
  setProductModifierGroups(productId: string, groupIds: string[]): void;
  getAllProductModifierScaleFactors(): Record<string, string | null>;
  setProductModifierScaleFactors(productId: string, modifierGroupId: string, scaleFactors: string | null): void;
  getAllProductModifierGroupSettings(): { productId: string; modifierGroupId: string; minSelections: number | null; maxSelections: number | null; modifierPrices: string | null; overrideInventoryItemId: string | null }[];
  updateProductModifierGroupSettings(productId: string, modifierGroupId: string, data: { minSelections?: number | null; maxSelections?: number | null; modifierPrices?: string | null; overrideInventoryItemId?: string | null }): void;

  getModifiers(groupId?: string): Modifier[];
  createModifier(data: InsertModifier): Modifier;
  updateModifier(id: string, data: Partial<InsertModifier>): Modifier | undefined;
  deleteModifier(id: string): void;

  getInventoryItems(): InventoryItem[];
  getInventoryItem(id: string): InventoryItem | undefined;
  createInventoryItem(data: InsertInventoryItem): InventoryItem;
  updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): InventoryItem | undefined;
  adjustInventoryQuantity(id: string, delta: number): InventoryItem | undefined;
  deleteInventoryItem(id: string): void;

  getBom(sourceType?: string, sourceId?: string): BillOfMaterials[];
  createBom(data: InsertBom): BillOfMaterials;
  updateBom(id: string, data: Partial<InsertBom>): BillOfMaterials | undefined;
  deleteBom(id: string): void;

  getEmployees(): Employee[];
  getEmployee(id: string): Employee | undefined;
  createEmployee(data: InsertEmployee): Employee;
  updateEmployee(id: string, data: Partial<InsertEmployee>): Employee | undefined;
  deleteEmployee(id: string): void;

  getTimePunches(employeeId?: string): TimePunch[];
  createTimePunch(data: InsertTimePunch): TimePunch;
  updateTimePunch(id: string, data: Partial<InsertTimePunch>): TimePunch | undefined;

  getSales(): Sale[];
  createSale(data: InsertSale): Sale;
}

export class SqliteStorage implements IStorage {
  getProducts(): Product[] {
    return db.select().from(products).all();
  }
  getProduct(id: string): Product | undefined {
    return db.select().from(products).where(eq(products.id, id)).get();
  }
  createProduct(data: InsertProduct): Product {
    db.insert(products).values(data).run();
    return this.getProduct(data.id)!;
  }
  updateProduct(id: string, data: Partial<InsertProduct>): Product | undefined {
    db.update(products).set(data).where(eq(products.id, id)).run();
    return this.getProduct(id);
  }
  deleteProduct(id: string): void {
    db.delete(products).where(eq(products.id, id)).run();
  }

  getVariants(productId?: string): Variant[] {
    if (productId) {
      return db.select().from(variants).where(eq(variants.productId, productId)).all();
    }
    return db.select().from(variants).all();
  }
  getVariant(id: string): Variant | undefined {
    return db.select().from(variants).where(eq(variants.id, id)).get();
  }
  createVariant(data: InsertVariant): Variant {
    db.insert(variants).values(data).run();
    return this.getVariant(data.id)!;
  }
  updateVariant(id: string, data: Partial<InsertVariant>): Variant | undefined {
    db.update(variants).set(data).where(eq(variants.id, id)).run();
    return this.getVariant(id);
  }
  deleteVariant(id: string): void {
    db.delete(variants).where(eq(variants.id, id)).run();
  }

  getModifierGroups(): ModifierGroup[] {
    return db.select().from(modifierGroups).all();
  }
  createModifierGroup(data: InsertModifierGroup): ModifierGroup {
    db.insert(modifierGroups).values(data).run();
    return db.select().from(modifierGroups).where(eq(modifierGroups.id, data.id)).get()!;
  }
  updateModifierGroup(id: string, data: Partial<InsertModifierGroup>): ModifierGroup | undefined {
    db.update(modifierGroups).set(data).where(eq(modifierGroups.id, id)).run();
    return db.select().from(modifierGroups).where(eq(modifierGroups.id, id)).get();
  }
  deleteModifierGroup(id: string): void {
    db.delete(modifierGroups).where(eq(modifierGroups.id, id)).run();
  }

  getAllProductModifierGroupLinks(): Record<string, string[]> {
    const rows = db.select().from(productModifierGroups).all();
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.productId]) map[r.productId] = [];
      map[r.productId].push(r.modifierGroupId);
    }
    return map;
  }
  getProductModifierGroups(productId: string): string[] {
    return db.select().from(productModifierGroups)
      .where(eq(productModifierGroups.productId, productId))
      .all()
      .map(r => r.modifierGroupId);
  }
  setProductModifierGroups(productId: string, groupIds: string[]): void {
    const existingRows = db.select().from(productModifierGroups)
      .where(eq(productModifierGroups.productId, productId)).all();
    const existingData: Record<string, typeof existingRows[0]> = {};
    for (const row of existingRows) {
      existingData[row.modifierGroupId] = row;
    }
    db.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId)).run();
    for (const gid of groupIds) {
      const prev = existingData[gid];
      db.insert(productModifierGroups).values({
        productId,
        modifierGroupId: gid,
        scaleFactors: prev?.scaleFactors || null,
        minSelections: prev?.minSelections ?? null,
        maxSelections: prev?.maxSelections ?? null,
        modifierPrices: prev?.modifierPrices || null,
        overrideInventoryItemId: prev?.overrideInventoryItemId || null,
      }).run();
    }
  }

  getAllProductModifierScaleFactors(): Record<string, string | null> {
    const rows = db.select().from(productModifierGroups).all();
    const map: Record<string, string | null> = {};
    for (const r of rows) {
      if (r.scaleFactors) {
        map[`${r.productId}::${r.modifierGroupId}`] = r.scaleFactors;
      }
    }
    return map;
  }

  setProductModifierScaleFactors(productId: string, modifierGroupId: string, scaleFactors: string | null): void {
    db.update(productModifierGroups)
      .set({ scaleFactors })
      .where(sql`${productModifierGroups.productId} = ${productId} AND ${productModifierGroups.modifierGroupId} = ${modifierGroupId}`)
      .run();
  }

  getAllProductModifierGroupSettings(): { productId: string; modifierGroupId: string; minSelections: number | null; maxSelections: number | null; modifierPrices: string | null; overrideInventoryItemId: string | null }[] {
    return db.select({
      productId: productModifierGroups.productId,
      modifierGroupId: productModifierGroups.modifierGroupId,
      minSelections: productModifierGroups.minSelections,
      maxSelections: productModifierGroups.maxSelections,
      modifierPrices: productModifierGroups.modifierPrices,
      overrideInventoryItemId: productModifierGroups.overrideInventoryItemId,
    }).from(productModifierGroups).all();
  }

  updateProductModifierGroupSettings(productId: string, modifierGroupId: string, data: { minSelections?: number | null; maxSelections?: number | null; modifierPrices?: string | null; overrideInventoryItemId?: string | null }): void {
    db.update(productModifierGroups)
      .set(data)
      .where(sql`${productModifierGroups.productId} = ${productId} AND ${productModifierGroups.modifierGroupId} = ${modifierGroupId}`)
      .run();
  }

  getModifiers(groupId?: string): Modifier[] {
    if (groupId) {
      return db.select().from(modifiers).where(eq(modifiers.modifierGroupId, groupId)).all();
    }
    return db.select().from(modifiers).all();
  }
  createModifier(data: InsertModifier): Modifier {
    db.insert(modifiers).values(data).run();
    return db.select().from(modifiers).where(eq(modifiers.id, data.id)).get()!;
  }
  updateModifier(id: string, data: Partial<InsertModifier>): Modifier | undefined {
    db.update(modifiers).set(data).where(eq(modifiers.id, id)).run();
    return db.select().from(modifiers).where(eq(modifiers.id, id)).get();
  }
  deleteModifier(id: string): void {
    db.delete(modifiers).where(eq(modifiers.id, id)).run();
  }

  getInventoryItems(): InventoryItem[] {
    return db.select().from(inventoryItems).all();
  }
  getInventoryItem(id: string): InventoryItem | undefined {
    return db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  }
  createInventoryItem(data: InsertInventoryItem): InventoryItem {
    db.insert(inventoryItems).values(data).run();
    return this.getInventoryItem(data.id)!;
  }
  updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): InventoryItem | undefined {
    db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id)).run();
    return this.getInventoryItem(id);
  }
  adjustInventoryQuantity(id: string, delta: number): InventoryItem | undefined {
    db.update(inventoryItems)
      .set({ currentQuantity: sql`MAX(0, ${inventoryItems.currentQuantity} + ${delta})` })
      .where(eq(inventoryItems.id, id))
      .run();
    return this.getInventoryItem(id);
  }
  deleteInventoryItem(id: string): void {
    db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
  }

  getBom(sourceType?: string, sourceId?: string): BillOfMaterials[] {
    let query = db.select().from(billOfMaterials);
    if (sourceType && sourceId) {
      return query.where(
        sql`${billOfMaterials.sourceType} = ${sourceType} AND ${billOfMaterials.sourceId} = ${sourceId}`
      ).all();
    }
    return query.all();
  }
  createBom(data: InsertBom): BillOfMaterials {
    db.insert(billOfMaterials).values(data).run();
    return db.select().from(billOfMaterials).where(eq(billOfMaterials.id, data.id)).get()!;
  }
  updateBom(id: string, data: Partial<InsertBom>): BillOfMaterials | undefined {
    db.update(billOfMaterials).set(data).where(eq(billOfMaterials.id, id)).run();
    return db.select().from(billOfMaterials).where(eq(billOfMaterials.id, id)).get();
  }
  deleteBom(id: string): void {
    db.delete(billOfMaterials).where(eq(billOfMaterials.id, id)).run();
  }

  getEmployees(): Employee[] {
    return db.select().from(employees).all();
  }
  getEmployee(id: string): Employee | undefined {
    return db.select().from(employees).where(eq(employees.id, id)).get();
  }
  createEmployee(data: InsertEmployee): Employee {
    db.insert(employees).values(data).run();
    return this.getEmployee(data.id)!;
  }
  updateEmployee(id: string, data: Partial<InsertEmployee>): Employee | undefined {
    db.update(employees).set(data).where(eq(employees.id, id)).run();
    return this.getEmployee(id);
  }
  deleteEmployee(id: string): void {
    db.delete(employees).where(eq(employees.id, id)).run();
  }

  getTimePunches(employeeId?: string): TimePunch[] {
    if (employeeId) {
      return db.select().from(timePunches).where(eq(timePunches.employeeId, employeeId)).all();
    }
    return db.select().from(timePunches).all();
  }
  createTimePunch(data: InsertTimePunch): TimePunch {
    db.insert(timePunches).values(data).run();
    return db.select().from(timePunches).where(eq(timePunches.id, data.id)).get()!;
  }
  updateTimePunch(id: string, data: Partial<InsertTimePunch>): TimePunch | undefined {
    db.update(timePunches).set(data).where(eq(timePunches.id, id)).run();
    return db.select().from(timePunches).where(eq(timePunches.id, id)).get();
  }

  getSales(): Sale[] {
    return db.select().from(sales).all();
  }
  createSale(data: InsertSale): Sale {
    db.insert(sales).values(data).run();
    return db.select().from(sales).where(eq(sales.id, data.id)).get()!;
  }
}

export const storage = new SqliteStorage();
