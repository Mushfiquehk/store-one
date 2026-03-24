import Dexie, { type Table } from "dexie";
import type {
  ProductAttributes,
  ModifierScaleFactors,
  ScaleFactorMatrix,
  SaleLine,
} from "@shared/schema";

export type { ProductAttributes, ModifierScaleFactors, ScaleFactorMatrix, SaleLine };

export interface Product {
  id: string;
  name: string;
  type: string;
  isComposite: boolean;
  availableAsIngredient: boolean;
  attributes: ProductAttributes | null;
  createdAt: string | null;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  basePrice: number;
  directInventoryId: string | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
}

export interface ProductModifierGroup {
  productId: string;
  modifierGroupId: string;
  scaleFactors: ModifierScaleFactors | null;
}

export interface Modifier {
  id: string;
  modifierGroupId: string;
  name: string;
  baseUpcharge: number;
  inventoryItemId: string | null;
  quantityPerUse: number | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  unitOfMeasure: string;
  currentQuantity: number;
  trackingConfig: string | null;
}

export interface BomEntry {
  id: string;
  sourceType: string;
  sourceId: string;
  inventoryItemId: string;
  sourceProductId: string | null;
  quantityDeducted: number;
  scaleFactorMatrix: ScaleFactorMatrix | null;
  overrideModifierGroupId: string | null;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  payRate: number;
  pin: string;
}

export interface TimePunch {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut: number | null;
}

export interface Sale {
  id: string;
  createdAt: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  status: string;
  linesJson: SaleLine[];
}

class PosDatabase extends Dexie {
  products!: Table<Product, string>;
  variants!: Table<Variant, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  productModifierGroups!: Table<ProductModifierGroup, [string, string]>;
  modifiers!: Table<Modifier, string>;
  inventoryItems!: Table<InventoryItem, string>;
  billOfMaterials!: Table<BomEntry, string>;
  employees!: Table<Employee, string>;
  timePunches!: Table<TimePunch, string>;
  sales!: Table<Sale, string>;

  constructor() {
    super("cornerpos");

    this.version(1).stores({
      products: "id, name, type",
      variants: "id, productId, sku",
      modifierGroups: "id, name",
      productModifierGroups: "[productId+modifierGroupId], productId, modifierGroupId",
      modifiers: "id, modifierGroupId",
      inventoryItems: "id, name",
      billOfMaterials: "id, sourceType, sourceId, inventoryItemId, [sourceType+sourceId]",
      employees: "id, name",
      timePunches: "id, employeeId",
      sales: "id, createdAt",
    });

    this.version(2).stores({
      products: "id, name, type, availableAsIngredient",
      variants: "id, productId, sku",
      modifierGroups: "id, name",
      productModifierGroups: "[productId+modifierGroupId], productId, modifierGroupId",
      modifiers: "id, modifierGroupId",
      inventoryItems: "id, name",
      billOfMaterials: "id, sourceType, sourceId, inventoryItemId, sourceProductId, [sourceType+sourceId]",
      employees: "id, name",
      timePunches: "id, employeeId",
      sales: "id, createdAt",
    }).upgrade(async tx => {
      await tx.table("products").toCollection().modify(product => {
        if (product.availableAsIngredient === undefined) {
          product.availableAsIngredient = false;
        }
      });
      await tx.table("billOfMaterials").toCollection().modify(entry => {
        if (entry.sourceProductId === undefined) {
          entry.sourceProductId = null;
        }
      });
    });

    this.version(3).stores({}).upgrade(async tx => {
      function safeParse(val: any): any {
        if (typeof val !== "string") return val;
        try { return JSON.parse(val); } catch { return val; }
      }

      await tx.table("products").toCollection().modify(product => {
        if (typeof product.attributes === "string") {
          product.attributes = safeParse(product.attributes);
        }
      });

      await tx.table("productModifierGroups").toCollection().modify(pmg => {
        if (typeof pmg.scaleFactors === "string") {
          pmg.scaleFactors = safeParse(pmg.scaleFactors);
        }
      });

      await tx.table("billOfMaterials").toCollection().modify(entry => {
        if (typeof entry.scaleFactorMatrix === "string") {
          entry.scaleFactorMatrix = safeParse(entry.scaleFactorMatrix);
        }
      });

      await tx.table("sales").toCollection().modify(sale => {
        if (typeof sale.linesJson === "string") {
          sale.linesJson = safeParse(sale.linesJson) ?? [];
        }
      });
    });
  }
}

export const db = new PosDatabase();
