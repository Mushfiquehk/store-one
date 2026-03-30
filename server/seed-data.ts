import type {
  Product,
  Variant,
  ModifierGroup,
  ProductModifierGroup,
  Modifier,
  InventoryItem,
  BomEntry,
} from "../shared/schema";

const DEMO_PREFIX = "demo_";

function buildSeedData() {
  const now = Date.now();

  const products: Product[] = [
    { id: `${DEMO_PREFIX}prod_coke_zero`, name: "Coke Zero", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["drinks"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}prod_lemonade`, name: "Fresh Lemonade", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["drinks"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}prod_candy_bar`, name: "Candy Bar", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["snacks"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}prod_tshirt`, name: "T-Shirt", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["merch"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}prod_cappuccino`, name: "Cappuccino", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["drinks"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}prod_club_sandwich`, name: "Club Sandwich", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["food"] }, createdAt: new Date().toISOString(), updatedAt: now, deletedAt: null },
  ];

  const variants: Variant[] = [
    { id: `${DEMO_PREFIX}var_coke_16`, productId: `${DEMO_PREFIX}prod_coke_zero`, sku: "CZ-16", name: "16 oz", basePrice: 199, directInventoryId: `${DEMO_PREFIX}inv_coke_16`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_coke_32`, productId: `${DEMO_PREFIX}prod_coke_zero`, sku: "CZ-32", name: "32 oz", basePrice: 299, directInventoryId: `${DEMO_PREFIX}inv_coke_32`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_coke_64`, productId: `${DEMO_PREFIX}prod_coke_zero`, sku: "CZ-64", name: "64 oz", basePrice: 399, directInventoryId: `${DEMO_PREFIX}inv_coke_64`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_lemon_16`, productId: `${DEMO_PREFIX}prod_lemonade`, sku: "LM-16", name: "16 oz", basePrice: 250, directInventoryId: `${DEMO_PREFIX}inv_lemon_16`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_lemon_32`, productId: `${DEMO_PREFIX}prod_lemonade`, sku: "LM-32", name: "32 oz", basePrice: 375, directInventoryId: `${DEMO_PREFIX}inv_lemon_32`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_lemon_64`, productId: `${DEMO_PREFIX}prod_lemonade`, sku: "LM-64", name: "64 oz", basePrice: 499, directInventoryId: `${DEMO_PREFIX}inv_lemon_64`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_candy`, productId: `${DEMO_PREFIX}prod_candy_bar`, sku: "CB-001", name: "Candy Bar", basePrice: 175, directInventoryId: `${DEMO_PREFIX}inv_candy_bars`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_tshirt_s`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-S", name: "Small", basePrice: 1499, directInventoryId: `${DEMO_PREFIX}inv_tshirt_s`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_tshirt_m`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-M", name: "Medium", basePrice: 1599, directInventoryId: `${DEMO_PREFIX}inv_tshirt_m`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_tshirt_l`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-L", name: "Large", basePrice: 1599, directInventoryId: `${DEMO_PREFIX}inv_tshirt_l`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_tshirt_xl`, productId: `${DEMO_PREFIX}prod_tshirt`, sku: "TS-XL", name: "XL", basePrice: 1799, directInventoryId: `${DEMO_PREFIX}inv_tshirt_xl`, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_cap_sm`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-SM", name: "Small", basePrice: 350, directInventoryId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_cap_md`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-MD", name: "Medium", basePrice: 450, directInventoryId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_cap_lg`, productId: `${DEMO_PREFIX}prod_cappuccino`, sku: "CAP-LG", name: "Large", basePrice: 525, directInventoryId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}var_sandwich`, productId: `${DEMO_PREFIX}prod_club_sandwich`, sku: "CS-001", name: "Club Sandwich", basePrice: 895, directInventoryId: null, updatedAt: now, deletedAt: null },
  ];

  const inventoryItems: InventoryItem[] = [
    { id: `${DEMO_PREFIX}inv_coke_16`, name: "Coke Zero 16oz", unitOfMeasure: "each", currentQuantity: 48, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_coke_32`, name: "Coke Zero 32oz", unitOfMeasure: "each", currentQuantity: 36, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_coke_64`, name: "Coke Zero 64oz", unitOfMeasure: "each", currentQuantity: 24, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_lemon_16`, name: "Fresh Lemonade 16oz", unitOfMeasure: "each", currentQuantity: 40, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_lemon_32`, name: "Fresh Lemonade 32oz", unitOfMeasure: "each", currentQuantity: 30, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_lemon_64`, name: "Fresh Lemonade 64oz", unitOfMeasure: "each", currentQuantity: 20, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_candy_bars`, name: "Candy Bars", unitOfMeasure: "each", currentQuantity: 50, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_tshirt_s`, name: "T-Shirts (S)", unitOfMeasure: "each", currentQuantity: 25, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_tshirt_m`, name: "T-Shirts (M)", unitOfMeasure: "each", currentQuantity: 30, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_tshirt_l`, name: "T-Shirts (L)", unitOfMeasure: "each", currentQuantity: 30, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_tshirt_xl`, name: "T-Shirts (XL)", unitOfMeasure: "each", currentQuantity: 20, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_coffee_beans`, name: "Coffee Beans", unitOfMeasure: "oz", currentQuantity: 500, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_whole_milk`, name: "Whole Milk", unitOfMeasure: "oz", currentQuantity: 200, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_oat_milk`, name: "Oat Milk", unitOfMeasure: "oz", currentQuantity: 150, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_almond_milk`, name: "Almond Milk", unitOfMeasure: "oz", currentQuantity: 150, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_bread_white`, name: "White Bread", unitOfMeasure: "slices", currentQuantity: 100, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_bread_wheat`, name: "Wheat Bread", unitOfMeasure: "slices", currentQuantity: 80, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_bread_sourdough`, name: "Sourdough Bread", unitOfMeasure: "slices", currentQuantity: 60, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_turkey`, name: "Turkey", unitOfMeasure: "oz", currentQuantity: 200, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_bacon`, name: "Bacon", unitOfMeasure: "strips", currentQuantity: 150, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}inv_lettuce`, name: "Lettuce", unitOfMeasure: "leaves", currentQuantity: 200, lowStockThreshold: null, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
  ];

  const modifierGroups: ModifierGroup[] = [
    { id: `${DEMO_PREFIX}mg_milk`, name: "Milk Options", minSelections: 1, maxSelections: 1, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mg_bread`, name: "Bread Choice", minSelections: 1, maxSelections: 1, updatedAt: now, deletedAt: null },
  ];

  const productModifierGroups: ProductModifierGroup[] = [
    { productId: `${DEMO_PREFIX}prod_cappuccino`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, scaleFactors: null, updatedAt: now, deletedAt: null },
    { productId: `${DEMO_PREFIX}prod_club_sandwich`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, scaleFactors: null, updatedAt: now, deletedAt: null },
  ];

  const modifiers: Modifier[] = [
    { id: `${DEMO_PREFIX}mod_whole_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Whole Milk", baseUpcharge: 0, inventoryItemId: `${DEMO_PREFIX}inv_whole_milk`, quantityPerUse: 4, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mod_oat_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Oat Milk", baseUpcharge: 75, inventoryItemId: `${DEMO_PREFIX}inv_oat_milk`, quantityPerUse: 4, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mod_almond_milk`, modifierGroupId: `${DEMO_PREFIX}mg_milk`, name: "Almond Milk", baseUpcharge: 75, inventoryItemId: `${DEMO_PREFIX}inv_almond_milk`, quantityPerUse: 4, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mod_white_bread`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "White Bread", baseUpcharge: 0, inventoryItemId: `${DEMO_PREFIX}inv_bread_white`, quantityPerUse: 3, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mod_wheat_bread`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "Wheat Bread", baseUpcharge: 0, inventoryItemId: `${DEMO_PREFIX}inv_bread_wheat`, quantityPerUse: 3, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}mod_sourdough`, modifierGroupId: `${DEMO_PREFIX}mg_bread`, name: "Sourdough", baseUpcharge: 50, inventoryItemId: `${DEMO_PREFIX}inv_bread_sourdough`, quantityPerUse: 3, updatedAt: now, deletedAt: null },
  ];

  const bomEntries: BomEntry[] = [
    { id: `${DEMO_PREFIX}bom_cap_sm_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_sm`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}bom_cap_md_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_md`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 0.75, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}bom_cap_lg_beans`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_cap_lg`, inventoryItemId: `${DEMO_PREFIX}inv_coffee_beans`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}bom_sandwich_turkey`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_turkey`, sourceProductId: null, quantityDeducted: 4, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}bom_sandwich_bacon`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_bacon`, sourceProductId: null, quantityDeducted: 3, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
    { id: `${DEMO_PREFIX}bom_sandwich_lettuce`, sourceType: "VARIANT", sourceId: `${DEMO_PREFIX}var_sandwich`, inventoryItemId: `${DEMO_PREFIX}inv_lettuce`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  ];

  return { products, variants, inventoryItems, modifierGroups, productModifierGroups, modifiers, bomEntries };
}

interface SeedRecord {
  tableName: string;
  recordId: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
}

export function getDemoSeedRecords(): SeedRecord[] {
  const data = buildSeedData();
  const records: SeedRecord[] = [];

  for (const p of data.products) {
    records.push({ tableName: "products", recordId: p.id, data: p as unknown as Record<string, unknown>, updatedAt: p.updatedAt, deletedAt: p.deletedAt });
  }
  for (const v of data.variants) {
    records.push({ tableName: "variants", recordId: v.id, data: v as unknown as Record<string, unknown>, updatedAt: v.updatedAt, deletedAt: v.deletedAt });
  }
  for (const ii of data.inventoryItems) {
    records.push({ tableName: "inventoryItems", recordId: ii.id, data: ii as unknown as Record<string, unknown>, updatedAt: ii.updatedAt, deletedAt: ii.deletedAt });
  }
  for (const mg of data.modifierGroups) {
    records.push({ tableName: "modifierGroups", recordId: mg.id, data: mg as unknown as Record<string, unknown>, updatedAt: mg.updatedAt, deletedAt: mg.deletedAt });
  }
  for (const pmg of data.productModifierGroups) {
    const recordId = `${pmg.productId}::${pmg.modifierGroupId}`;
    records.push({ tableName: "productModifierGroups", recordId, data: pmg as unknown as Record<string, unknown>, updatedAt: pmg.updatedAt, deletedAt: pmg.deletedAt });
  }
  for (const m of data.modifiers) {
    records.push({ tableName: "modifiers", recordId: m.id, data: m as unknown as Record<string, unknown>, updatedAt: m.updatedAt, deletedAt: m.deletedAt });
  }
  for (const b of data.bomEntries) {
    records.push({ tableName: "billOfMaterials", recordId: b.id, data: b as unknown as Record<string, unknown>, updatedAt: b.updatedAt, deletedAt: b.deletedAt });
  }

  return records;
}

export const DEMO_PREFIX_VALUE = DEMO_PREFIX;
