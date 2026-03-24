import { db } from "./db";
import type {
  Product,
  Variant,
  ModifierGroup,
  ProductModifierGroup,
  Modifier,
  InventoryItem,
  BomEntry,
} from "./db";

const DEMO_PREFIX = "demo_";

const products: Product[] = [
  { id: `${DEMO_PREFIX}prod_water_bottle`, name: "Water Bottle", type: "retail", isComposite: false, availableAsIngredient: false, attributes: JSON.stringify({ tags: ["drinks"] }), createdAt: new Date().toISOString() },
  { id: `${DEMO_PREFIX}prod_candy_bar`, name: "Candy Bar", type: "retail", isComposite: false, availableAsIngredient: false, attributes: JSON.stringify({ tags: ["snacks"] }), createdAt: new Date().toISOString() },
  { id: `${DEMO_PREFIX}prod_tshirt`, name: "T-Shirt", type: "retail", isComposite: false, availableAsIngredient: false, attributes: JSON.stringify({ tags: ["merch"] }), createdAt: new Date().toISOString() },
  { id: `${DEMO_PREFIX}prod_cappuccino`, name: "Cappuccino", type: "prepared", isComposite: true, availableAsIngredient: false, attributes: JSON.stringify({ tags: ["drinks"] }), createdAt: new Date().toISOString() },
  { id: `${DEMO_PREFIX}prod_club_sandwich`, name: "Club Sandwich", type: "prepared", isComposite: true, availableAsIngredient: false, attributes: JSON.stringify({ tags: ["food"] }), createdAt: new Date().toISOString() },
];

const variants: Variant[] = [
  { id: `${DEMO_PREFIX}var_water`, productId: `${DEMO_PREFIX}prod_water_bottle`, sku: "WB-001", name: "Water Bottle", basePrice: 250, directInventoryId: `${DEMO_PREFIX}inv_water_bottles`, config: null },
  { id: `${DEMO_PREFIX}var_candy`, productId: `${DEMO_PREFIX}prod_candy_bar`, sku: "CB-001", name: "Candy Bar", basePrice: 175, directInventoryId: `${DEMO_PREFIX}inv_candy_bars`, config: null },
  { id: `${DEMO_PREFIX}var_tshirt_s`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-S", name: "Small", basePrice: 1499, directInventoryId: `${DEMO_PREFIX}inv_tshirt_s`, config: null },
  { id: `${DEMO_PREFIX}var_tshirt_m`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-M", name: "Medium", basePrice: 1599, directInventoryId: `${DEMO_PREFIX}inv_tshirt_m`, config: null },
  { id: `${DEMO_PREFIX}var_tshirt_l`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-L", name: "Large", basePrice: 1599, directInventoryId: `${DEMO_PREFIX}inv_tshirt_l`, config: null },
  { id: `${DEMO_PREFIX}var_tshirt_xl`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-XL", name: "XL", basePrice: 1799, directInventoryId: `${DEMO_PREFIX}inv_tshirt_xl`, config: null },
  { id: `${DEMO_PREFIX}var_cap_sm`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-SM", name: "Small", basePrice: 350, directInventoryId: null, config: null },
  { id: `${DEMO_PREFIX}var_cap_md`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-MD", name: "Medium", basePrice: 450, directInventoryId: null, config: null },
  { id: `${DEMO_PREFIX}var_cap_lg`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-LG", name: "Large", basePrice: 525, directInventoryId: null, config: null },
  { id: `${DEMO_PREFIX}var_sandwich`, productId: `${DEMO_PREFIX}prod_club_sandwich`, sku: "CS-001", name: "Club Sandwich", basePrice: 895, directInventoryId: null, config: null },
];

const inventoryItems: InventoryItem[] = [
  { id: `${DEMO_PREFIX}inv_water_bottles`, name: "Water Bottles", unitOfMeasure: "each", currentQuantity: 100, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_candy_bars`, name: "Candy Bars", unitOfMeasure: "each", currentQuantity: 50, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_tshirt_s`, name: "T-Shirts (S)", unitOfMeasure: "each", currentQuantity: 25, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_tshirt_m`, name: "T-Shirts (M)", unitOfMeasure: "each", currentQuantity: 30, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_tshirt_l`, name: "T-Shirts (L)", unitOfMeasure: "each", currentQuantity: 30, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_tshirt_xl`, name: "T-Shirts (XL)", unitOfMeasure: "each", currentQuantity: 20, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_coffee_beans`, name: "Coffee Beans", unitOfMeasure: "oz", currentQuantity: 500, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_whole_milk`, name: "Whole Milk", unitOfMeasure: "oz", currentQuantity: 200, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_oat_milk`, name: "Oat Milk", unitOfMeasure: "oz", currentQuantity: 150, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_almond_milk`, name: "Almond Milk", unitOfMeasure: "oz", currentQuantity: 150, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_bread_white`, name: "White Bread", unitOfMeasure: "slices", currentQuantity: 100, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_bread_wheat`, name: "Wheat Bread", unitOfMeasure: "slices", currentQuantity: 80, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_bread_sourdough`, name: "Sourdough Bread", unitOfMeasure: "slices", currentQuantity: 60, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_turkey`, name: "Turkey", unitOfMeasure: "oz", currentQuantity: 200, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_bacon`, name: "Bacon", unitOfMeasure: "strips", currentQuantity: 150, trackingConfig: null },
  { id: `${DEMO_PREFIX}inv_lettuce`, name: "Lettuce", unitOfMeasure: "leaves", currentQuantity: 200, trackingConfig: null },
];

const modifierGroups: ModifierGroup[] = [
  { id: `${DEMO_PREFIX}mg_milk`, name: "Milk Options", minSelections: 1, maxSelections: 1, selectionRules: null },
  { id: `${DEMO_PREFIX}mg_bread`, name: "Bread Choice", minSelections: 1, maxSelections: 1, selectionRules: null },
];

const productModifierGroups: ProductModifierGroup[] = [
  { productId: `${DEMO_PREFIX}prod_cappuccino`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, scaleFactors: null },
  { productId: `${DEMO_PREFIX}prod_club_sandwich`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, scaleFactors: null },
];

const modifiers: Modifier[] = [
  { id: `${DEMO_PREFIX}mod_whole_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Whole Milk", baseUpcharge: 0, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_whole_milk`, quantityPerUse: 4 },
  { id: `${DEMO_PREFIX}mod_oat_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Oat Milk", baseUpcharge: 75, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_oat_milk`, quantityPerUse: 4 },
  { id: `${DEMO_PREFIX}mod_almond_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Almond Milk", baseUpcharge: 75, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_almond_milk`, quantityPerUse: 4 },
  { id: `${DEMO_PREFIX}mod_white_bread`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "White Bread", baseUpcharge: 0, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_bread_white`, quantityPerUse: 3 },
  { id: `${DEMO_PREFIX}mod_wheat_bread`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "Wheat Bread", baseUpcharge: 0, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_bread_wheat`, quantityPerUse: 3 },
  { id: `${DEMO_PREFIX}mod_sourdough`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "Sourdough", baseUpcharge: 50, scaleFactor: null, pricingLogic: null, inventoryItemId: `${DEMO_PREFIX}inv_bread_sourdough`, quantityPerUse: 3 },
];

const bomEntries: BomEntry[] = [
  { id: `${DEMO_PREFIX}bom_cap_sm_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_sm`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null },
  { id: `${DEMO_PREFIX}bom_cap_md_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_md`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 0.75, scaleFactorMatrix: null, overrideModifierGroupId: null },
  { id: `${DEMO_PREFIX}bom_cap_lg_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_lg`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null },
  { id: `${DEMO_PREFIX}bom_sandwich_turkey`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_turkey`, sourceProductId: null, quantityDeducted: 4, scaleFactorMatrix: null, overrideModifierGroupId: null },
  { id: `${DEMO_PREFIX}bom_sandwich_bacon`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_bacon`, sourceProductId: null, quantityDeducted: 3, scaleFactorMatrix: null, overrideModifierGroupId: null },
  { id: `${DEMO_PREFIX}bom_sandwich_lettuce`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_lettuce`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null },
];

export async function isDemoDataSeeded(): Promise<boolean> {
  const count = await db.products.where("id").startsWith(DEMO_PREFIX).count();
  return count > 0;
}

export async function clearDemoData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.products, db.variants, db.modifierGroups, db.productModifierGroups, db.modifiers, db.inventoryItems, db.billOfMaterials],
    async () => {
      const bomKeys = await db.billOfMaterials.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.billOfMaterials.bulkDelete(bomKeys);

      const modKeys = await db.modifiers.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.modifiers.bulkDelete(modKeys);

      const invKeys = await db.inventoryItems.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.inventoryItems.bulkDelete(invKeys);

      const mgKeys = await db.modifierGroups.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.modifierGroups.bulkDelete(mgKeys);

      const varKeys = await db.variants.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.variants.bulkDelete(varKeys);

      const prodKeys = await db.products.where("id").startsWith(DEMO_PREFIX).primaryKeys();
      await db.products.bulkDelete(prodKeys);

      const pmgRows = await db.productModifierGroups.toArray();
      const demoPmgKeys = pmgRows
        .filter(r => r.productId.startsWith(DEMO_PREFIX) || r.modifierGroupId.startsWith(DEMO_PREFIX))
        .map(r => [r.productId, r.modifierGroupId] as [string, string]);
      for (const key of demoPmgKeys) {
        await db.productModifierGroups.delete(key);
      }
    }
  );
}

export async function seedDemoData(): Promise<void> {
  await clearDemoData();

  await db.transaction(
    "rw",
    [db.products, db.variants, db.modifierGroups, db.productModifierGroups, db.modifiers, db.inventoryItems, db.billOfMaterials],
    async () => {
      await db.inventoryItems.bulkPut(inventoryItems);
      await db.products.bulkPut(products);
      await db.variants.bulkPut(variants);
      await db.modifierGroups.bulkPut(modifierGroups);
      for (const pmg of productModifierGroups) {
        await db.productModifierGroups.put(pmg);
      }
      await db.modifiers.bulkPut(modifiers);
      await db.billOfMaterials.bulkPut(bomEntries);
    }
  );
}
