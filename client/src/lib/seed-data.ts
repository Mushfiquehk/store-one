import { db } from "./db";
import type {
  Product,
  Variant,
  ModifierGroup,
  ProductModifierGroup,
  Modifier,
  InventoryItem,
  BomEntry,
  Sale,
  Employee,
  TimePunch,
} from "./db";
import type { SaleLine } from "@shared/schema";

const D = "demo_";
const now = Date.now();
const iso = new Date().toISOString();

const inventoryItems: InventoryItem[] = [
  { id: `${D}inv_espresso_beans`, name: "Espresso Beans", unitOfMeasure: "oz", currentQuantity: 640, lowStockThreshold: 100, lastPurchasePrice: 1200, updatedAt: now, deletedAt: null },
  { id: `${D}inv_whole_milk`, name: "Whole Milk", unitOfMeasure: "oz", currentQuantity: 512, lowStockThreshold: 64, lastPurchasePrice: 450, updatedAt: now, deletedAt: null },
  { id: `${D}inv_oat_milk`, name: "Oat Milk", unitOfMeasure: "oz", currentQuantity: 384, lowStockThreshold: 48, lastPurchasePrice: 650, updatedAt: now, deletedAt: null },
  { id: `${D}inv_almond_milk`, name: "Almond Milk", unitOfMeasure: "oz", currentQuantity: 256, lowStockThreshold: 48, lastPurchasePrice: 550, updatedAt: now, deletedAt: null },
  { id: `${D}inv_skim_milk`, name: "Skim Milk", unitOfMeasure: "oz", currentQuantity: 256, lowStockThreshold: 48, lastPurchasePrice: 400, updatedAt: now, deletedAt: null },
  { id: `${D}inv_vanilla_syrup`, name: "Vanilla Syrup", unitOfMeasure: "pumps", currentQuantity: 500, lowStockThreshold: 50, lastPurchasePrice: 800, updatedAt: now, deletedAt: null },
  { id: `${D}inv_caramel_syrup`, name: "Caramel Syrup", unitOfMeasure: "pumps", currentQuantity: 400, lowStockThreshold: 50, lastPurchasePrice: 850, updatedAt: now, deletedAt: null },
  { id: `${D}inv_hazelnut_syrup`, name: "Hazelnut Syrup", unitOfMeasure: "pumps", currentQuantity: 300, lowStockThreshold: 50, lastPurchasePrice: 900, updatedAt: now, deletedAt: null },
  { id: `${D}inv_mocha_sauce`, name: "Mocha Sauce", unitOfMeasure: "pumps", currentQuantity: 300, lowStockThreshold: 30, lastPurchasePrice: 950, updatedAt: now, deletedAt: null },
  { id: `${D}inv_matcha_powder`, name: "Matcha Powder", unitOfMeasure: "tsp", currentQuantity: 200, lowStockThreshold: 20, lastPurchasePrice: 2500, updatedAt: now, deletedAt: null },
  { id: `${D}inv_chai_concentrate`, name: "Chai Concentrate", unitOfMeasure: "oz", currentQuantity: 256, lowStockThreshold: 32, lastPurchasePrice: 1100, updatedAt: now, deletedAt: null },
  { id: `${D}inv_hot_choc_mix`, name: "Hot Chocolate Mix", unitOfMeasure: "oz", currentQuantity: 200, lowStockThreshold: 24, lastPurchasePrice: 700, updatedAt: now, deletedAt: null },
  { id: `${D}inv_whipped_cream`, name: "Whipped Cream", unitOfMeasure: "oz", currentQuantity: 300, lowStockThreshold: 30, lastPurchasePrice: 500, updatedAt: now, deletedAt: null },
  { id: `${D}inv_ice`, name: "Ice", unitOfMeasure: "oz", currentQuantity: 2000, lowStockThreshold: 200, lastPurchasePrice: null, updatedAt: now, deletedAt: null },
  { id: `${D}inv_flour`, name: "All-Purpose Flour", unitOfMeasure: "oz", currentQuantity: 800, lowStockThreshold: 100, lastPurchasePrice: 300, updatedAt: now, deletedAt: null },
  { id: `${D}inv_butter`, name: "Butter", unitOfMeasure: "oz", currentQuantity: 400, lowStockThreshold: 50, lastPurchasePrice: 600, updatedAt: now, deletedAt: null },
  { id: `${D}inv_sugar`, name: "Sugar", unitOfMeasure: "oz", currentQuantity: 600, lowStockThreshold: 60, lastPurchasePrice: 250, updatedAt: now, deletedAt: null },
  { id: `${D}inv_blueberries`, name: "Blueberries", unitOfMeasure: "oz", currentQuantity: 100, lowStockThreshold: 12, lastPurchasePrice: 400, updatedAt: now, deletedAt: null },
  { id: `${D}inv_choc_chips`, name: "Chocolate Chips", unitOfMeasure: "oz", currentQuantity: 150, lowStockThreshold: 16, lastPurchasePrice: 350, updatedAt: now, deletedAt: null },
  { id: `${D}inv_cream_cheese`, name: "Cream Cheese", unitOfMeasure: "oz", currentQuantity: 200, lowStockThreshold: 20, lastPurchasePrice: 450, updatedAt: now, deletedAt: null },
  { id: `${D}inv_croissant_dough`, name: "Croissant Dough", unitOfMeasure: "each", currentQuantity: 48, lowStockThreshold: 6, lastPurchasePrice: 150, updatedAt: now, deletedAt: null },
  { id: `${D}inv_bagel_dough`, name: "Bagel Dough", unitOfMeasure: "each", currentQuantity: 60, lowStockThreshold: 8, lastPurchasePrice: 100, updatedAt: now, deletedAt: null },
  { id: `${D}inv_sourdough`, name: "Sourdough Bread", unitOfMeasure: "slices", currentQuantity: 80, lowStockThreshold: 10, lastPurchasePrice: 35, updatedAt: now, deletedAt: null },
  { id: `${D}inv_white_bread`, name: "White Bread", unitOfMeasure: "slices", currentQuantity: 100, lowStockThreshold: 12, lastPurchasePrice: 25, updatedAt: now, deletedAt: null },
  { id: `${D}inv_wheat_bread`, name: "Wheat Bread", unitOfMeasure: "slices", currentQuantity: 90, lowStockThreshold: 12, lastPurchasePrice: 30, updatedAt: now, deletedAt: null },
  { id: `${D}inv_turkey`, name: "Turkey Breast", unitOfMeasure: "oz", currentQuantity: 160, lowStockThreshold: 20, lastPurchasePrice: 800, updatedAt: now, deletedAt: null },
  { id: `${D}inv_ham`, name: "Ham", unitOfMeasure: "oz", currentQuantity: 120, lowStockThreshold: 16, lastPurchasePrice: 700, updatedAt: now, deletedAt: null },
  { id: `${D}inv_cheddar`, name: "Cheddar Cheese", unitOfMeasure: "slices", currentQuantity: 100, lowStockThreshold: 12, lastPurchasePrice: 50, updatedAt: now, deletedAt: null },
  { id: `${D}inv_swiss`, name: "Swiss Cheese", unitOfMeasure: "slices", currentQuantity: 80, lowStockThreshold: 10, lastPurchasePrice: 60, updatedAt: now, deletedAt: null },
  { id: `${D}inv_lettuce`, name: "Lettuce", unitOfMeasure: "leaves", currentQuantity: 200, lowStockThreshold: 20, lastPurchasePrice: 10, updatedAt: now, deletedAt: null },
  { id: `${D}inv_tomato`, name: "Tomato", unitOfMeasure: "slices", currentQuantity: 150, lowStockThreshold: 15, lastPurchasePrice: 15, updatedAt: now, deletedAt: null },
  { id: `${D}inv_avocado`, name: "Avocado", unitOfMeasure: "oz", currentQuantity: 100, lowStockThreshold: 12, lastPurchasePrice: 200, updatedAt: now, deletedAt: null },
  { id: `${D}inv_bottled_water`, name: "Bottled Water", unitOfMeasure: "each", currentQuantity: 72, lowStockThreshold: 12, lastPurchasePrice: 50, updatedAt: now, deletedAt: null },
  { id: `${D}inv_beans_12oz`, name: "Retail Beans 12oz Bag", unitOfMeasure: "each", currentQuantity: 30, lowStockThreshold: 5, lastPurchasePrice: 800, updatedAt: now, deletedAt: null },
  { id: `${D}inv_beans_1lb`, name: "Retail Beans 1lb Bag", unitOfMeasure: "each", currentQuantity: 20, lowStockThreshold: 3, lastPurchasePrice: 1000, updatedAt: now, deletedAt: null },
  { id: `${D}inv_travel_mug`, name: "Travel Mugs", unitOfMeasure: "each", currentQuantity: 15, lowStockThreshold: 3, lastPurchasePrice: 500, updatedAt: now, deletedAt: null },
];

const products: Product[] = [
  { id: `${D}prod_espresso_shot`, name: "Espresso Shot", type: "RESTAURANT", isComposite: true, availableAsIngredient: true, attributes: { tags: ["sub-product"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_latte`, name: "Latte", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_cappuccino`, name: "Cappuccino", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_americano`, name: "Americano", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_mocha`, name: "Mocha", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_matcha_latte`, name: "Matcha Latte", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["specialty", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_chai_latte`, name: "Chai Latte", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["specialty", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_hot_choc`, name: "Hot Chocolate", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["specialty", "hot"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_iced_latte`, name: "Iced Latte", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "cold"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_cold_brew`, name: "Cold Brew", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["espresso", "cold"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_muffin`, name: "Blueberry Muffin", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["bakery"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_cookie`, name: "Chocolate Chip Cookie", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["bakery"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_croissant`, name: "Butter Croissant", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["bakery"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_bagel`, name: "Plain Bagel", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["bakery"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_bagel_cc`, name: "Bagel with Cream Cheese", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["bakery"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_turkey_club`, name: "Turkey Club", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["sandwich"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_ham_swiss`, name: "Ham & Swiss", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["sandwich"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_avo_toast`, name: "Avocado Toast", type: "RESTAURANT", isComposite: true, availableAsIngredient: false, attributes: { tags: ["sandwich"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_water`, name: "Bottled Water", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["retail"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_beans_bag`, name: "Bag of Coffee Beans", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["retail"] }, createdAt: iso, updatedAt: now, deletedAt: null },
  { id: `${D}prod_travel_mug`, name: "Travel Mug", type: "RETAIL", isComposite: false, availableAsIngredient: false, attributes: { tags: ["retail"] }, createdAt: iso, updatedAt: now, deletedAt: null },
];

const V = (suffix: string) => `${D}var_${suffix}`;
const variants: Variant[] = [
  { id: V("esp_single"), productId: `${D}prod_espresso_shot`, sku: "ESP-1", name: "Single", basePrice: 200, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("latte_s"), productId: `${D}prod_latte`, sku: "LAT-S", name: "Small", basePrice: 425, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("latte_m"), productId: `${D}prod_latte`, sku: "LAT-M", name: "Medium", basePrice: 525, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("latte_l"), productId: `${D}prod_latte`, sku: "LAT-L", name: "Large", basePrice: 595, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cap_s"), productId: `${D}prod_cappuccino`, sku: "CAP-S", name: "Small", basePrice: 395, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cap_m"), productId: `${D}prod_cappuccino`, sku: "CAP-M", name: "Medium", basePrice: 495, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cap_l"), productId: `${D}prod_cappuccino`, sku: "CAP-L", name: "Large", basePrice: 550, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("amer_s"), productId: `${D}prod_americano`, sku: "AMR-S", name: "Small", basePrice: 295, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("amer_m"), productId: `${D}prod_americano`, sku: "AMR-M", name: "Medium", basePrice: 350, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("amer_l"), productId: `${D}prod_americano`, sku: "AMR-L", name: "Large", basePrice: 395, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("mocha_s"), productId: `${D}prod_mocha`, sku: "MOC-S", name: "Small", basePrice: 475, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("mocha_m"), productId: `${D}prod_mocha`, sku: "MOC-M", name: "Medium", basePrice: 575, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("mocha_l"), productId: `${D}prod_mocha`, sku: "MOC-L", name: "Large", basePrice: 650, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("matcha_s"), productId: `${D}prod_matcha_latte`, sku: "MAT-S", name: "Small", basePrice: 450, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("matcha_m"), productId: `${D}prod_matcha_latte`, sku: "MAT-M", name: "Medium", basePrice: 550, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("matcha_l"), productId: `${D}prod_matcha_latte`, sku: "MAT-L", name: "Large", basePrice: 625, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("chai_s"), productId: `${D}prod_chai_latte`, sku: "CHI-S", name: "Small", basePrice: 425, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("chai_m"), productId: `${D}prod_chai_latte`, sku: "CHI-M", name: "Medium", basePrice: 500, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("chai_l"), productId: `${D}prod_chai_latte`, sku: "CHI-L", name: "Large", basePrice: 575, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("hc_s"), productId: `${D}prod_hot_choc`, sku: "HC-S", name: "Small", basePrice: 375, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("hc_m"), productId: `${D}prod_hot_choc`, sku: "HC-M", name: "Medium", basePrice: 450, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("hc_l"), productId: `${D}prod_hot_choc`, sku: "HC-L", name: "Large", basePrice: 525, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("iced_s"), productId: `${D}prod_iced_latte`, sku: "ICL-S", name: "Small", basePrice: 450, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("iced_m"), productId: `${D}prod_iced_latte`, sku: "ICL-M", name: "Medium", basePrice: 550, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("iced_l"), productId: `${D}prod_iced_latte`, sku: "ICL-L", name: "Large", basePrice: 625, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cb_s"), productId: `${D}prod_cold_brew`, sku: "CB-S", name: "Small", basePrice: 395, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cb_m"), productId: `${D}prod_cold_brew`, sku: "CB-M", name: "Medium", basePrice: 475, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cb_l"), productId: `${D}prod_cold_brew`, sku: "CB-L", name: "Large", basePrice: 550, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("muffin"), productId: `${D}prod_muffin`, sku: "MUF-1", name: "Blueberry Muffin", basePrice: 350, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("cookie"), productId: `${D}prod_cookie`, sku: "COK-1", name: "Chocolate Chip Cookie", basePrice: 275, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("croissant"), productId: `${D}prod_croissant`, sku: "CRO-1", name: "Butter Croissant", basePrice: 325, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("bagel"), productId: `${D}prod_bagel`, sku: "BAG-1", name: "Plain Bagel", basePrice: 250, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("bagel_cc"), productId: `${D}prod_bagel_cc`, sku: "BAG-CC", name: "Bagel w/ Cream Cheese", basePrice: 375, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("turkey_club"), productId: `${D}prod_turkey_club`, sku: "TKC-1", name: "Turkey Club", basePrice: 895, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("ham_swiss"), productId: `${D}prod_ham_swiss`, sku: "HMS-1", name: "Ham & Swiss", basePrice: 850, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("avo_toast"), productId: `${D}prod_avo_toast`, sku: "AVO-1", name: "Avocado Toast", basePrice: 795, directInventoryId: null, updatedAt: now, deletedAt: null },
  { id: V("water"), productId: `${D}prod_water`, sku: "WTR-1", name: "Bottled Water", basePrice: 225, directInventoryId: `${D}inv_bottled_water`, updatedAt: now, deletedAt: null },
  { id: V("beans_12"), productId: `${D}prod_beans_bag`, sku: "BNS-12", name: "12 oz", basePrice: 1495, directInventoryId: `${D}inv_beans_12oz`, updatedAt: now, deletedAt: null },
  { id: V("beans_1lb"), productId: `${D}prod_beans_bag`, sku: "BNS-1L", name: "1 lb", basePrice: 1895, directInventoryId: `${D}inv_beans_1lb`, updatedAt: now, deletedAt: null },
  { id: V("mug"), productId: `${D}prod_travel_mug`, sku: "MUG-1", name: "Travel Mug", basePrice: 1295, directInventoryId: `${D}inv_travel_mug`, updatedAt: now, deletedAt: null },
];

const MG = (suffix: string) => `${D}mg_${suffix}`;
const modifierGroups: ModifierGroup[] = [
  { id: MG("milk"), name: "Milk Choice", minSelections: 1, maxSelections: 1, updatedAt: now, deletedAt: null },
  { id: MG("splash"), name: "Splash of Milk", minSelections: 0, maxSelections: 1, updatedAt: now, deletedAt: null },
  { id: MG("syrup"), name: "Syrup Flavors", minSelections: 0, maxSelections: 3, updatedAt: now, deletedAt: null },
  { id: MG("extras"), name: "Extras", minSelections: 0, maxSelections: 2, updatedAt: now, deletedAt: null },
  { id: MG("bread"), name: "Bread Choice", minSelections: 1, maxSelections: 1, updatedAt: now, deletedAt: null },
];

const MOD = (suffix: string) => `${D}mod_${suffix}`;
const modifiers: Modifier[] = [
  { id: MOD("whole_milk"), modifierGroupId: MG("milk"), name: "Whole Milk", baseUpcharge: 0, inventoryItemId: `${D}inv_whole_milk`, quantityPerUse: 8, updatedAt: now, deletedAt: null },
  { id: MOD("oat_milk"), modifierGroupId: MG("milk"), name: "Oat Milk", baseUpcharge: 75, inventoryItemId: `${D}inv_oat_milk`, quantityPerUse: 8, updatedAt: now, deletedAt: null },
  { id: MOD("almond_milk"), modifierGroupId: MG("milk"), name: "Almond Milk", baseUpcharge: 75, inventoryItemId: `${D}inv_almond_milk`, quantityPerUse: 8, updatedAt: now, deletedAt: null },
  { id: MOD("skim_milk"), modifierGroupId: MG("milk"), name: "Skim Milk", baseUpcharge: 0, inventoryItemId: `${D}inv_skim_milk`, quantityPerUse: 8, updatedAt: now, deletedAt: null },
  { id: MOD("splash_whole"), modifierGroupId: MG("splash"), name: "Whole Milk", baseUpcharge: 0, inventoryItemId: `${D}inv_whole_milk`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("splash_oat"), modifierGroupId: MG("splash"), name: "Oat Milk", baseUpcharge: 50, inventoryItemId: `${D}inv_oat_milk`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("splash_almond"), modifierGroupId: MG("splash"), name: "Almond Milk", baseUpcharge: 50, inventoryItemId: `${D}inv_almond_milk`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("vanilla"), modifierGroupId: MG("syrup"), name: "Vanilla", baseUpcharge: 65, inventoryItemId: `${D}inv_vanilla_syrup`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("caramel"), modifierGroupId: MG("syrup"), name: "Caramel", baseUpcharge: 65, inventoryItemId: `${D}inv_caramel_syrup`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("hazelnut"), modifierGroupId: MG("syrup"), name: "Hazelnut", baseUpcharge: 65, inventoryItemId: `${D}inv_hazelnut_syrup`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("extra_shot"), modifierGroupId: MG("extras"), name: "Extra Shot", baseUpcharge: 75, inventoryItemId: `${D}inv_espresso_beans`, quantityPerUse: 0.5, updatedAt: now, deletedAt: null },
  { id: MOD("whip"), modifierGroupId: MG("extras"), name: "Whipped Cream", baseUpcharge: 50, inventoryItemId: `${D}inv_whipped_cream`, quantityPerUse: 1, updatedAt: now, deletedAt: null },
  { id: MOD("sourdough"), modifierGroupId: MG("bread"), name: "Sourdough", baseUpcharge: 0, inventoryItemId: `${D}inv_sourdough`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("white_bread"), modifierGroupId: MG("bread"), name: "White", baseUpcharge: 0, inventoryItemId: `${D}inv_white_bread`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
  { id: MOD("wheat_bread"), modifierGroupId: MG("bread"), name: "Wheat", baseUpcharge: 0, inventoryItemId: `${D}inv_wheat_bread`, quantityPerUse: 2, updatedAt: now, deletedAt: null },
];

const latteScaleFactors = {
  [MOD("oat_milk")]: { [V("latte_s")]: 75, [V("latte_m")]: 75, [V("latte_l")]: 100 },
  [MOD("almond_milk")]: { [V("latte_s")]: 75, [V("latte_m")]: 75, [V("latte_l")]: 100 },
};

const mochaScaleFactors = {
  [MOD("oat_milk")]: { [V("mocha_s")]: 75, [V("mocha_m")]: 75, [V("mocha_l")]: 100 },
  [MOD("almond_milk")]: { [V("mocha_s")]: 75, [V("mocha_m")]: 75, [V("mocha_l")]: 100 },
};

const icedLatteScaleFactors = {
  [MOD("oat_milk")]: { [V("iced_s")]: 75, [V("iced_m")]: 75, [V("iced_l")]: 100 },
  [MOD("almond_milk")]: { [V("iced_s")]: 75, [V("iced_m")]: 75, [V("iced_l")]: 100 },
};

const productModifierGroups: ProductModifierGroup[] = [
  { productId: `${D}prod_latte`, modifierGroupId: MG("milk"), scaleFactors: latteScaleFactors, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_latte`, modifierGroupId: MG("syrup"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_latte`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_cappuccino`, modifierGroupId: MG("milk"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_cappuccino`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_americano`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_mocha`, modifierGroupId: MG("milk"), scaleFactors: mochaScaleFactors, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_mocha`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_matcha_latte`, modifierGroupId: MG("milk"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_chai_latte`, modifierGroupId: MG("milk"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_chai_latte`, modifierGroupId: MG("syrup"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_hot_choc`, modifierGroupId: MG("milk"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_hot_choc`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_iced_latte`, modifierGroupId: MG("milk"), scaleFactors: icedLatteScaleFactors, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_iced_latte`, modifierGroupId: MG("syrup"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_iced_latte`, modifierGroupId: MG("extras"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_cold_brew`, modifierGroupId: MG("splash"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_cold_brew`, modifierGroupId: MG("syrup"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_turkey_club`, modifierGroupId: MG("bread"), scaleFactors: null, updatedAt: now, deletedAt: null },
  { productId: `${D}prod_ham_swiss`, modifierGroupId: MG("bread"), scaleFactors: null, updatedAt: now, deletedAt: null },
];

const B = (suffix: string) => `${D}bom_${suffix}`;
const bomEntries: BomEntry[] = [
  { id: B("esp_beans"), sourceType: "VARIANT", sourceId: V("esp_single"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("latte_esp"), sourceType: "VARIANT", sourceId: V("latte_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: `${D}prod_espresso_shot`, quantityDeducted: 1, scaleFactorMatrix: { [V("latte_s")]: 1, [V("latte_m")]: 2, [V("latte_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("latte_milk"), sourceType: "VARIANT", sourceId: V("latte_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: { [V("latte_s")]: 1, [V("latte_m")]: 1.5, [V("latte_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },

  { id: B("cap_esp"), sourceType: "VARIANT", sourceId: V("cap_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: `${D}prod_espresso_shot`, quantityDeducted: 1, scaleFactorMatrix: { [V("cap_s")]: 1, [V("cap_m")]: 2, [V("cap_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cap_milk"), sourceType: "VARIANT", sourceId: V("cap_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 6, scaleFactorMatrix: { [V("cap_s")]: 1, [V("cap_m")]: 1.33, [V("cap_l")]: 1.67 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },

  { id: B("amer_esp"), sourceType: "VARIANT", sourceId: V("amer_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: `${D}prod_espresso_shot`, quantityDeducted: 1, scaleFactorMatrix: { [V("amer_s")]: 1, [V("amer_m")]: 2, [V("amer_l")]: 3 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("mocha_esp"), sourceType: "VARIANT", sourceId: V("mocha_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: `${D}prod_espresso_shot`, quantityDeducted: 1, scaleFactorMatrix: { [V("mocha_s")]: 1, [V("mocha_m")]: 2, [V("mocha_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("mocha_sauce"), sourceType: "VARIANT", sourceId: V("mocha_s"), inventoryItemId: `${D}inv_mocha_sauce`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: { [V("mocha_s")]: 1, [V("mocha_m")]: 1.5, [V("mocha_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("mocha_milk"), sourceType: "VARIANT", sourceId: V("mocha_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: { [V("mocha_s")]: 1, [V("mocha_m")]: 1.5, [V("mocha_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },
  { id: B("mocha_whip"), sourceType: "VARIANT", sourceId: V("mocha_s"), inventoryItemId: `${D}inv_whipped_cream`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: { [V("mocha_s")]: 1, [V("mocha_m")]: 1, [V("mocha_l")]: 1.5 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("matcha_powder"), sourceType: "VARIANT", sourceId: V("matcha_s"), inventoryItemId: `${D}inv_matcha_powder`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: { [V("matcha_s")]: 1, [V("matcha_m")]: 1.5, [V("matcha_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("matcha_milk"), sourceType: "VARIANT", sourceId: V("matcha_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: { [V("matcha_s")]: 1, [V("matcha_m")]: 1.5, [V("matcha_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },

  { id: B("chai_conc"), sourceType: "VARIANT", sourceId: V("chai_s"), inventoryItemId: `${D}inv_chai_concentrate`, sourceProductId: null, quantityDeducted: 4, scaleFactorMatrix: { [V("chai_s")]: 1, [V("chai_m")]: 1.5, [V("chai_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("chai_milk"), sourceType: "VARIANT", sourceId: V("chai_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 4, scaleFactorMatrix: { [V("chai_s")]: 1, [V("chai_m")]: 1.5, [V("chai_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },

  { id: B("hc_mix"), sourceType: "VARIANT", sourceId: V("hc_s"), inventoryItemId: `${D}inv_hot_choc_mix`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: { [V("hc_s")]: 1, [V("hc_m")]: 1.5, [V("hc_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("hc_milk"), sourceType: "VARIANT", sourceId: V("hc_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: { [V("hc_s")]: 1, [V("hc_m")]: 1.5, [V("hc_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },

  { id: B("iced_esp"), sourceType: "VARIANT", sourceId: V("iced_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: `${D}prod_espresso_shot`, quantityDeducted: 1, scaleFactorMatrix: { [V("iced_s")]: 1, [V("iced_m")]: 2, [V("iced_l")]: 3 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("iced_milk"), sourceType: "VARIANT", sourceId: V("iced_s"), inventoryItemId: `${D}inv_whole_milk`, sourceProductId: null, quantityDeducted: 6, scaleFactorMatrix: { [V("iced_s")]: 1, [V("iced_m")]: 1.5, [V("iced_l")]: 2 }, overrideModifierGroupId: MG("milk"), updatedAt: now, deletedAt: null },
  { id: B("iced_ice"), sourceType: "VARIANT", sourceId: V("iced_s"), inventoryItemId: `${D}inv_ice`, sourceProductId: null, quantityDeducted: 6, scaleFactorMatrix: { [V("iced_s")]: 1, [V("iced_m")]: 1.5, [V("iced_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("cb_beans"), sourceType: "VARIANT", sourceId: V("cb_s"), inventoryItemId: `${D}inv_espresso_beans`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: { [V("cb_s")]: 1, [V("cb_m")]: 1.5, [V("cb_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cb_ice"), sourceType: "VARIANT", sourceId: V("cb_s"), inventoryItemId: `${D}inv_ice`, sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: { [V("cb_s")]: 1, [V("cb_m")]: 1.5, [V("cb_l")]: 2 }, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("muf_flour"), sourceType: "VARIANT", sourceId: V("muffin"), inventoryItemId: `${D}inv_flour`, sourceProductId: null, quantityDeducted: 3, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("muf_butter"), sourceType: "VARIANT", sourceId: V("muffin"), inventoryItemId: `${D}inv_butter`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("muf_sugar"), sourceType: "VARIANT", sourceId: V("muffin"), inventoryItemId: `${D}inv_sugar`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("muf_blue"), sourceType: "VARIANT", sourceId: V("muffin"), inventoryItemId: `${D}inv_blueberries`, sourceProductId: null, quantityDeducted: 1.5, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("cok_flour"), sourceType: "VARIANT", sourceId: V("cookie"), inventoryItemId: `${D}inv_flour`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cok_butter"), sourceType: "VARIANT", sourceId: V("cookie"), inventoryItemId: `${D}inv_butter`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cok_sugar"), sourceType: "VARIANT", sourceId: V("cookie"), inventoryItemId: `${D}inv_sugar`, sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cok_chips"), sourceType: "VARIANT", sourceId: V("cookie"), inventoryItemId: `${D}inv_choc_chips`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("cro_dough"), sourceType: "VARIANT", sourceId: V("croissant"), inventoryItemId: `${D}inv_croissant_dough`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("cro_butter"), sourceType: "VARIANT", sourceId: V("croissant"), inventoryItemId: `${D}inv_butter`, sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("bag_dough"), sourceType: "VARIANT", sourceId: V("bagel"), inventoryItemId: `${D}inv_bagel_dough`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("bagcc_dough"), sourceType: "VARIANT", sourceId: V("bagel_cc"), inventoryItemId: `${D}inv_bagel_dough`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("bagcc_cc"), sourceType: "VARIANT", sourceId: V("bagel_cc"), inventoryItemId: `${D}inv_cream_cheese`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("tkc_turkey"), sourceType: "VARIANT", sourceId: V("turkey_club"), inventoryItemId: `${D}inv_turkey`, sourceProductId: null, quantityDeducted: 4, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("tkc_cheddar"), sourceType: "VARIANT", sourceId: V("turkey_club"), inventoryItemId: `${D}inv_cheddar`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("tkc_lettuce"), sourceType: "VARIANT", sourceId: V("turkey_club"), inventoryItemId: `${D}inv_lettuce`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("tkc_tomato"), sourceType: "VARIANT", sourceId: V("turkey_club"), inventoryItemId: `${D}inv_tomato`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("hms_ham"), sourceType: "VARIANT", sourceId: V("ham_swiss"), inventoryItemId: `${D}inv_ham`, sourceProductId: null, quantityDeducted: 3, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("hms_swiss"), sourceType: "VARIANT", sourceId: V("ham_swiss"), inventoryItemId: `${D}inv_swiss`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("hms_lettuce"), sourceType: "VARIANT", sourceId: V("ham_swiss"), inventoryItemId: `${D}inv_lettuce`, sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },

  { id: B("avo_bread"), sourceType: "VARIANT", sourceId: V("avo_toast"), inventoryItemId: `${D}inv_sourdough`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("avo_avo"), sourceType: "VARIANT", sourceId: V("avo_toast"), inventoryItemId: `${D}inv_avocado`, sourceProductId: null, quantityDeducted: 3, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
  { id: B("avo_tomato"), sourceType: "VARIANT", sourceId: V("avo_toast"), inventoryItemId: `${D}inv_tomato`, sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null, updatedAt: now, deletedAt: null },
];

const employees: Employee[] = [
  { id: `${D}emp_alex`, name: "Alex Rivera", role: "manager", payRate: 2200, pin: "1234", updatedAt: now, deletedAt: null },
  { id: `${D}emp_jordan`, name: "Jordan Chen", role: "barista", payRate: 1600, pin: "5678", updatedAt: now, deletedAt: null },
  { id: `${D}emp_sam`, name: "Sam Patel", role: "barista", payRate: 1550, pin: "9012", updatedAt: now, deletedAt: null },
  { id: `${D}emp_casey`, name: "Casey Kim", role: "cashier", payRate: 1400, pin: "3456", updatedAt: now, deletedAt: null },
];

function generateTimePunches(): TimePunch[] {
  const punches: TimePunch[] = [];
  const empIds = employees.map(e => e.id);
  const MS_PER_DAY = 86400000;
  for (let d = 14; d >= 0; d--) {
    const dayStart = now - d * MS_PER_DAY;
    const base = dayStart - (dayStart % MS_PER_DAY) + 6 * 3600000;
    const working = d % 7 < 5 ? empIds : empIds.slice(0, 2);
    working.forEach((empId, i) => {
      const timeIn = base + i * 1800000;
      const timeOut = timeIn + (7 + Math.floor(Math.random() * 2)) * 3600000;
      punches.push({ id: `${D}tp_d${d}_e${i}`, employeeId: empId, timeIn, timeOut, updatedAt: now, deletedAt: null });
    });
  }
  return punches;
}

type OrderTemplate = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  basePrice: number;
  mods?: { modifierId: string; name: string; unitPrice: number }[];
  weight: number;
};

const orderPool: OrderTemplate[] = [
  { productId: `${D}prod_latte`, variantId: V("latte_s"), productName: "Latte", variantName: "Small", basePrice: 425, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 12 },
  { productId: `${D}prod_latte`, variantId: V("latte_m"), productName: "Latte", variantName: "Medium", basePrice: 525, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 18 },
  { productId: `${D}prod_latte`, variantId: V("latte_l"), productName: "Latte", variantName: "Large", basePrice: 595, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 100 }], weight: 10 },
  { productId: `${D}prod_latte`, variantId: V("latte_m"), productName: "Latte", variantName: "Medium", basePrice: 525, mods: [{ modifierId: MOD("almond_milk"), name: "Almond Milk", unitPrice: 75 }, { modifierId: MOD("vanilla"), name: "Vanilla", unitPrice: 65 }], weight: 8 },
  { productId: `${D}prod_latte`, variantId: V("latte_l"), productName: "Latte", variantName: "Large", basePrice: 595, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }, { modifierId: MOD("caramel"), name: "Caramel", unitPrice: 65 }, { modifierId: MOD("extra_shot"), name: "Extra Shot", unitPrice: 75 }], weight: 6 },
  { productId: `${D}prod_cappuccino`, variantId: V("cap_s"), productName: "Cappuccino", variantName: "Small", basePrice: 395, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 10 },
  { productId: `${D}prod_cappuccino`, variantId: V("cap_m"), productName: "Cappuccino", variantName: "Medium", basePrice: 495, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 75 }], weight: 8 },
  { productId: `${D}prod_cappuccino`, variantId: V("cap_l"), productName: "Cappuccino", variantName: "Large", basePrice: 550, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 5 },
  { productId: `${D}prod_americano`, variantId: V("amer_s"), productName: "Americano", variantName: "Small", basePrice: 295, weight: 8 },
  { productId: `${D}prod_americano`, variantId: V("amer_m"), productName: "Americano", variantName: "Medium", basePrice: 350, weight: 10 },
  { productId: `${D}prod_americano`, variantId: V("amer_l"), productName: "Americano", variantName: "Large", basePrice: 395, mods: [{ modifierId: MOD("extra_shot"), name: "Extra Shot", unitPrice: 75 }], weight: 5 },
  { productId: `${D}prod_mocha`, variantId: V("mocha_s"), productName: "Mocha", variantName: "Small", basePrice: 475, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 6 },
  { productId: `${D}prod_mocha`, variantId: V("mocha_m"), productName: "Mocha", variantName: "Medium", basePrice: 575, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 75 }, { modifierId: MOD("whip"), name: "Whipped Cream", unitPrice: 50 }], weight: 7 },
  { productId: `${D}prod_mocha`, variantId: V("mocha_l"), productName: "Mocha", variantName: "Large", basePrice: 650, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 4 },
  { productId: `${D}prod_matcha_latte`, variantId: V("matcha_s"), productName: "Matcha Latte", variantName: "Small", basePrice: 450, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 75 }], weight: 5 },
  { productId: `${D}prod_matcha_latte`, variantId: V("matcha_m"), productName: "Matcha Latte", variantName: "Medium", basePrice: 550, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 6 },
  { productId: `${D}prod_matcha_latte`, variantId: V("matcha_l"), productName: "Matcha Latte", variantName: "Large", basePrice: 625, mods: [{ modifierId: MOD("almond_milk"), name: "Almond Milk", unitPrice: 75 }], weight: 3 },
  { productId: `${D}prod_chai_latte`, variantId: V("chai_s"), productName: "Chai Latte", variantName: "Small", basePrice: 425, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 5 },
  { productId: `${D}prod_chai_latte`, variantId: V("chai_m"), productName: "Chai Latte", variantName: "Medium", basePrice: 500, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 75 }, { modifierId: MOD("vanilla"), name: "Vanilla", unitPrice: 65 }], weight: 6 },
  { productId: `${D}prod_chai_latte`, variantId: V("chai_l"), productName: "Chai Latte", variantName: "Large", basePrice: 575, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 3 },
  { productId: `${D}prod_hot_choc`, variantId: V("hc_s"), productName: "Hot Chocolate", variantName: "Small", basePrice: 375, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }, { modifierId: MOD("whip"), name: "Whipped Cream", unitPrice: 50 }], weight: 4 },
  { productId: `${D}prod_hot_choc`, variantId: V("hc_m"), productName: "Hot Chocolate", variantName: "Medium", basePrice: 450, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 5 },
  { productId: `${D}prod_hot_choc`, variantId: V("hc_l"), productName: "Hot Chocolate", variantName: "Large", basePrice: 525, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }, { modifierId: MOD("whip"), name: "Whipped Cream", unitPrice: 50 }], weight: 3 },
  { productId: `${D}prod_iced_latte`, variantId: V("iced_s"), productName: "Iced Latte", variantName: "Small", basePrice: 450, mods: [{ modifierId: MOD("whole_milk"), name: "Whole Milk", unitPrice: 0 }], weight: 8 },
  { productId: `${D}prod_iced_latte`, variantId: V("iced_m"), productName: "Iced Latte", variantName: "Medium", basePrice: 550, mods: [{ modifierId: MOD("oat_milk"), name: "Oat Milk", unitPrice: 75 }, { modifierId: MOD("vanilla"), name: "Vanilla", unitPrice: 65 }], weight: 10 },
  { productId: `${D}prod_iced_latte`, variantId: V("iced_l"), productName: "Iced Latte", variantName: "Large", basePrice: 625, mods: [{ modifierId: MOD("almond_milk"), name: "Almond Milk", unitPrice: 100 }, { modifierId: MOD("caramel"), name: "Caramel", unitPrice: 65 }], weight: 6 },
  { productId: `${D}prod_cold_brew`, variantId: V("cb_s"), productName: "Cold Brew", variantName: "Small", basePrice: 395, weight: 7 },
  { productId: `${D}prod_cold_brew`, variantId: V("cb_m"), productName: "Cold Brew", variantName: "Medium", basePrice: 475, mods: [{ modifierId: MOD("splash_oat"), name: "Oat Milk", unitPrice: 50 }], weight: 9 },
  { productId: `${D}prod_cold_brew`, variantId: V("cb_l"), productName: "Cold Brew", variantName: "Large", basePrice: 550, mods: [{ modifierId: MOD("splash_whole"), name: "Whole Milk", unitPrice: 0 }, { modifierId: MOD("vanilla"), name: "Vanilla", unitPrice: 65 }], weight: 5 },
  { productId: `${D}prod_muffin`, variantId: V("muffin"), productName: "Blueberry Muffin", variantName: "Blueberry Muffin", basePrice: 350, weight: 7 },
  { productId: `${D}prod_cookie`, variantId: V("cookie"), productName: "Chocolate Chip Cookie", variantName: "Chocolate Chip Cookie", basePrice: 275, weight: 8 },
  { productId: `${D}prod_croissant`, variantId: V("croissant"), productName: "Butter Croissant", variantName: "Butter Croissant", basePrice: 325, weight: 9 },
  { productId: `${D}prod_bagel`, variantId: V("bagel"), productName: "Plain Bagel", variantName: "Plain Bagel", basePrice: 250, weight: 5 },
  { productId: `${D}prod_bagel_cc`, variantId: V("bagel_cc"), productName: "Bagel with Cream Cheese", variantName: "Bagel w/ Cream Cheese", basePrice: 375, weight: 8 },
  { productId: `${D}prod_turkey_club`, variantId: V("turkey_club"), productName: "Turkey Club", variantName: "Turkey Club", basePrice: 895, mods: [{ modifierId: MOD("sourdough"), name: "Sourdough", unitPrice: 0 }], weight: 5 },
  { productId: `${D}prod_turkey_club`, variantId: V("turkey_club"), productName: "Turkey Club", variantName: "Turkey Club", basePrice: 895, mods: [{ modifierId: MOD("wheat_bread"), name: "Wheat", unitPrice: 0 }], weight: 3 },
  { productId: `${D}prod_ham_swiss`, variantId: V("ham_swiss"), productName: "Ham & Swiss", variantName: "Ham & Swiss", basePrice: 850, mods: [{ modifierId: MOD("white_bread"), name: "White", unitPrice: 0 }], weight: 4 },
  { productId: `${D}prod_ham_swiss`, variantId: V("ham_swiss"), productName: "Ham & Swiss", variantName: "Ham & Swiss", basePrice: 850, mods: [{ modifierId: MOD("sourdough"), name: "Sourdough", unitPrice: 0 }], weight: 3 },
  { productId: `${D}prod_avo_toast`, variantId: V("avo_toast"), productName: "Avocado Toast", variantName: "Avocado Toast", basePrice: 795, weight: 6 },
  { productId: `${D}prod_water`, variantId: V("water"), productName: "Bottled Water", variantName: "Bottled Water", basePrice: 225, weight: 6 },
  { productId: `${D}prod_beans_bag`, variantId: V("beans_12"), productName: "Bag of Coffee Beans", variantName: "12 oz", basePrice: 1495, weight: 2 },
  { productId: `${D}prod_beans_bag`, variantId: V("beans_1lb"), productName: "Bag of Coffee Beans", variantName: "1 lb", basePrice: 1895, weight: 1 },
  { productId: `${D}prod_travel_mug`, variantId: V("mug"), productName: "Travel Mug", variantName: "Travel Mug", basePrice: 1295, weight: 1 },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateSales(): Sale[] {
  const sales: Sale[] = [];
  const TAX_RATE = 0.0825;
  const MS_PER_DAY = 86400000;
  const random = seededRandom(42);

  const totalWeight = orderPool.reduce((s, o) => s + o.weight, 0);
  function pickItem(): OrderTemplate {
    let r = random() * totalWeight;
    for (const item of orderPool) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return orderPool[0];
  }

  const paymentMethods = ["cash", "card", "card", "card", "card"];

  for (let d = 14; d >= 0; d--) {
    const dayBase = now - d * MS_PER_DAY;
    const dayStart = dayBase - (dayBase % MS_PER_DAY) + 7 * 3600000;
    const isWeekend = new Date(dayStart).getDay() === 0 || new Date(dayStart).getDay() === 6;
    const orderCount = isWeekend
      ? 25 + Math.floor(random() * 15)
      : 18 + Math.floor(random() * 12);

    for (let o = 0; o < orderCount; o++) {
      const saleTime = dayStart + Math.floor(random() * 12 * 3600000);
      const itemCount = random() < 0.35 ? 1 : random() < 0.7 ? 2 : 3;
      const lines: SaleLine[] = [];

      for (let i = 0; i < itemCount; i++) {
        const tmpl = pickItem();
        const modEntries = (tmpl.mods || []).map(m => ({
          modifierId: m.modifierId,
          name: m.name,
          qty: 1,
          unitPrice: m.unitPrice,
        }));
        const modTotal = modEntries.reduce((s, m) => s + m.unitPrice * m.qty, 0);
        lines.push({
          variantId: tmpl.variantId,
          productId: tmpl.productId,
          productName: tmpl.productName,
          variantName: tmpl.variantName,
          qty: 1,
          modifiers: modEntries,
          unitPrice: tmpl.basePrice + modTotal,
        });
      }

      const subtotalCents = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      const taxCents = Math.round(subtotalCents * TAX_RATE);
      const totalCents = subtotalCents + taxCents;
      const pm = paymentMethods[Math.floor(random() * paymentMethods.length)];

      sales.push({
        id: `${D}sale_d${d}_o${o}`,
        createdAt: saleTime,
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod: pm,
        status: "completed",
        linesJson: lines,
        updatedAt: now,
        deletedAt: null,
      });
    }
  }
  return sales;
}

export async function isDemoDataSeeded(): Promise<boolean> {
  const count = await db.products.where("id").startsWith(D).count();
  return count > 0;
}

export async function clearDemoData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.products, db.variants, db.modifierGroups, db.productModifierGroups, db.modifiers, db.inventoryItems, db.billOfMaterials, db.sales, db.employees, db.timePunches],
    async () => {
      for (const table of [db.billOfMaterials, db.modifiers, db.inventoryItems, db.modifierGroups, db.variants, db.products, db.sales, db.employees, db.timePunches]) {
        const keys = await table.where("id").startsWith(D).primaryKeys();
        await table.bulkDelete(keys as string[]);
      }
      const pmgRows = await db.productModifierGroups.toArray();
      const demoPmgKeys = pmgRows
        .filter(r => r.productId.startsWith(D) || r.modifierGroupId.startsWith(D))
        .map(r => [r.productId, r.modifierGroupId] as [string, string]);
      for (const key of demoPmgKeys) {
        await db.productModifierGroups.delete(key);
      }
    }
  );
}

export async function seedDemoData(): Promise<void> {
  await clearDemoData();

  const sales = generateSales();
  const timePunches = generateTimePunches();

  await db.transaction(
    "rw",
    [db.products, db.variants, db.modifierGroups, db.productModifierGroups, db.modifiers, db.inventoryItems, db.billOfMaterials, db.sales, db.employees, db.timePunches],
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
      await db.employees.bulkPut(employees);
      await db.timePunches.bulkPut(timePunches);
      await db.sales.bulkPut(sales);
    }
  );
}
