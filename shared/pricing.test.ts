import { test } from "node:test";
import assert from "node:assert/strict";
import { costVariant, marginPct, sumIngredientCosts } from "./pricing";
import type { CostingData } from "./pricing";

// A latte: two ingredients through the variant's own recipe, one of them via a
// sub-recipe, plus a modifier — so the cost comes off the real depletion walk rather
// than a hand-rolled sum.
const data = (over: Partial<CostingData> = {}): CostingData => ({
  products: [{ id: "p_espresso" }],
  variants: [
    { id: "v_latte", name: "Small", productId: "p_latte", directInventoryId: null },
    { id: "v_shot", name: "Single", productId: "p_espresso", directInventoryId: null },
  ],
  modifiers: [{ id: "m_oat", modifierGroupId: "mg_milk", inventoryItemId: "i_oat", quantityPerUse: 8 }],
  bomEntries: [
    { sourceType: "VARIANT", sourceId: "v_latte", inventoryItemId: "i_beans", sourceProductId: "p_espresso", quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null },
    { sourceType: "VARIANT", sourceId: "v_latte", inventoryItemId: "i_milk", sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: null, overrideModifierGroupId: null },
    { sourceType: "VARIANT", sourceId: "v_shot", inventoryItemId: "i_beans", sourceProductId: null, quantityDeducted: 0.5, scaleFactorMatrix: null, overrideModifierGroupId: null },
  ],
  inventoryItems: [
    { id: "i_beans", name: "Espresso Beans", lastPurchasePrice: 40 },
    { id: "i_milk", name: "Whole Milk", lastPurchasePrice: 3 },
    { id: "i_oat", name: "Oat Milk", lastPurchasePrice: 10 },
  ],
  ...over,
});

test("a fully-priced variant costs what its recipe adds up to", () => {
  // 0.5 oz beans @ 40 = 20, plus 8 oz milk @ 3 = 24.
  assert.deepEqual(costVariant("v_latte", data()), { costCents: 44, unknownIngredients: [] });
});

test("an unpriced ingredient is named, and is not treated as free", () => {
  const cost = costVariant("v_latte", data({
    inventoryItems: [
      { id: "i_beans", name: "Espresso Beans", lastPurchasePrice: 40 },
      { id: "i_milk", name: "Whole Milk", lastPurchasePrice: null },
      { id: "i_oat", name: "Oat Milk", lastPurchasePrice: 10 },
    ],
  }));

  assert.deepEqual(cost.unknownIngredients, ["Whole Milk"]);
  // The priced part is still reported, but as a floor — and because the caller is told
  // the list is non-empty, it cannot pass 20 off as the cost of the drink.
  assert.equal(cost.costCents, 20);
  assert.equal(marginPct(400, cost), null, "no margin may be stated on an unknown cost");
});

test("an ingredient the catalogue does not know is unknown, not skipped", () => {
  const cost = costVariant("v_latte", data({
    inventoryItems: [{ id: "i_beans", name: "Espresso Beans", lastPurchasePrice: 40 }],
  }));
  assert.deepEqual(cost.unknownIngredients, ["i_milk"]);
});

test("an item priced below its ingredients reports a negative margin", () => {
  // Negative margins are the entire point of the report; clamping them to zero would
  // hide the only rows an operator has to act on.
  const cost = { costCents: 44, unknownIngredients: [] };
  assert.equal(marginPct(40, cost), -10);
  assert.equal(marginPct(88, cost), 50);
});

test("a giveaway price states no margin rather than dividing by zero", () => {
  assert.equal(marginPct(0, { costCents: 44, unknownIngredients: [] }), null);
});

test("sumIngredientCosts rounds once, at the end, and names each unknown once", () => {
  const cost = sumIngredientCosts([
    { name: "Flour", quantity: 3, lastPurchasePrice: 1.4 },
    { name: "Butter", quantity: 1, lastPurchasePrice: null },
    { name: "Butter", quantity: 2, lastPurchasePrice: null },
  ]);
  assert.equal(cost.costCents, 4, "4.2 rounds to 4, not 3 × 1 = 3");
  assert.deepEqual(cost.unknownIngredients, ["Butter"]);
});
