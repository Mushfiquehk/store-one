import { test } from "node:test";
import assert from "node:assert/strict";
import { costVariant, marginPct, menuMargins, sumIngredientCosts, taxOnCart } from "./pricing";
import type { CostingData, MarginData } from "./pricing";

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
  assert.deepEqual(costVariant("v_latte", data()), { costCents: 44, unknownIngredients: [], hasRecipe: true });
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
  const cost = { costCents: 44, unknownIngredients: [], hasRecipe: true };
  assert.equal(marginPct(40, cost), -10);
  assert.equal(marginPct(88, cost), 50);
});

test("a giveaway price states no margin rather than dividing by zero", () => {
  assert.equal(marginPct(0, { costCents: 44, unknownIngredients: [], hasRecipe: true }), null);
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


const marginData = (): MarginData => ({
  products: [{ id: "p_latte", name: "Latte" }, { id: "p_cookie", name: "Cookie" }, { id: "p_soup", name: "Soup" }],
  variants: [
    { id: "v_latte", name: "Small", productId: "p_latte", basePrice: 400, directInventoryId: null },
    { id: "v_cookie", name: "One", productId: "p_cookie", basePrice: 100, directInventoryId: null },
    { id: "v_soup", name: "Bowl", productId: "p_soup", basePrice: 600, directInventoryId: null },
  ],
  modifiers: [],
  bomEntries: [
    { sourceType: "VARIANT", sourceId: "v_latte", inventoryItemId: "i_milk", sourceProductId: null, quantityDeducted: 8, scaleFactorMatrix: null, overrideModifierGroupId: null },
    // Priced at 150 against a 100 price: sold at a loss.
    { sourceType: "VARIANT", sourceId: "v_cookie", inventoryItemId: "i_flour", sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null },
    { sourceType: "VARIANT", sourceId: "v_soup", inventoryItemId: "i_stock", sourceProductId: null, quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null },
  ],
  inventoryItems: [
    { id: "i_milk", name: "Whole Milk", lastPurchasePrice: 3 },
    { id: "i_flour", name: "Flour", lastPurchasePrice: 150 },
    { id: "i_stock", name: "Stock", lastPurchasePrice: null },
  ],
});

test("the loss-making item is the first row, and the unpriced one is last", () => {
  const rows = menuMargins(marginData(), [{ variantId: "v_latte", quantity: 200 }, { variantId: "v_cookie", quantity: 10 }]);

  assert.deepEqual(rows.map(r => r.variantId), ["v_cookie", "v_latte", "v_soup"]);

  const cookie = rows[0];
  assert.equal(cookie.productName, "Cookie");
  assert.equal(cookie.costCents, 150);
  assert.equal(cookie.marginCents, -50, "a below-cost item is negative, not clamped to zero");
  assert.equal(cookie.marginPct, -50);
  assert.equal(cookie.contributionCents, -500, "ten sold at a 50c loss is 5 dollars gone");

  const latte = rows[1];
  assert.equal(latte.marginCents, 376);
  assert.equal(latte.contributionCents, 75200, "200 sold, weighted contribution");
});

test("an unknown cost states no margin and contributes nothing, rather than looking perfect", () => {
  const soup = menuMargins(marginData())[2];
  assert.equal(soup.costKnown, false);
  assert.equal(soup.marginPct, null);
  assert.equal(soup.marginCents, 0);
  assert.equal(soup.contributionCents, 0);
  assert.deepEqual(soup.unknownIngredients, ["Stock"], "and it says which ingredient to go price");
});

test("equal margins are ranked by what actually sells", () => {
  const data = marginData();
  data.variants = [
    { id: "v_a", name: "A", productId: "p_latte", basePrice: 200, directInventoryId: null },
    { id: "v_b", name: "B", productId: "p_latte", basePrice: 200, directInventoryId: null },
  ];
  data.bomEntries = ["v_a", "v_b"].map(id => ({
    sourceType: "VARIANT", sourceId: id, inventoryItemId: "i_milk", sourceProductId: null,
    quantityDeducted: 10, scaleFactorMatrix: null, overrideModifierGroupId: null,
  }));

  const rows = menuMargins(data, [{ variantId: "v_b", quantity: 500 }, { variantId: "v_a", quantity: 1 }]);
  assert.deepEqual(rows.map(r => r.variantId), ["v_b", "v_a"]);
});

test("a variant nobody bought still gets a row", () => {
  // Costing is about the menu, not about the window: an item that sold nothing in the
  // period is still priced wrong, and its row is where an operator finds that out.
  const rows = menuMargins(marginData(), []);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.quantity === 0 && r.contributionCents === 0));
});

test("a variant with no recipe at all is unknown, not a 100% margin", () => {
  // The seeded menu hangs BOM rows off a product's small variant only, so every medium
  // and large has no recipe. Costing them at zero would put the whole menu's biggest
  // sizes at the top of the margin report as the most profitable items on it.
  const d = marginData();
  d.variants.push({ id: "v_latte_l", name: "Large", productId: "p_latte", basePrice: 600, directInventoryId: null });

  const rows = menuMargins(d, [{ variantId: "v_latte_l", quantity: 999 }]);
  const large = rows.find(r => r.variantId === "v_latte_l")!;
  assert.equal(large.costKnown, false);
  assert.equal(large.marginPct, null);
  assert.equal(large.contributionCents, 0);
  assert.notEqual(rows[0].variantId, "v_latte_l", "and it does not lead the report");
});


test("an exempt line is not in the tax base", () => {
  // The plan's check: $10 taxable plus $10 exempt at 10% is one dollar of tax, not two.
  const tax = taxOnCart([
    { amountCents: 1000, exempt: false },
    { amountCents: 1000, exempt: true },
  ], 10);

  assert.equal(tax.taxCents, 100);
  assert.equal(tax.taxableCents, 1000);
  assert.equal(tax.exemptCents, 1000, "and the receipt can say what was excluded");
});

test("a discount reduces the taxable base rather than being taxed through", () => {
  // $20 cart, half of it exempt, $4 off: the taxable half drops to $8, so 10% is 80 cents.
  const tax = taxOnCart([
    { amountCents: 1000, exempt: false },
    { amountCents: 1000, exempt: true },
  ], 10, 400);

  assert.equal(tax.taxableCents, 800);
  assert.equal(tax.taxCents, 80, "not 100, which is tax on the pre-discount total");
});

test("an all-exempt cart is charged nothing, whatever the rate", () => {
  const tax = taxOnCart([{ amountCents: 5000, exempt: true }], 8.25);
  assert.deepEqual(tax, { taxCents: 0, taxableCents: 0, exemptCents: 5000 });
});

test("an empty cart and an over-large discount do not produce negative tax", () => {
  assert.deepEqual(taxOnCart([], 10), { taxCents: 0, taxableCents: 0, exemptCents: 0 });
  const overDiscounted = taxOnCart([{ amountCents: 1000, exempt: false }], 10, 5000);
  assert.equal(overDiscounted.taxCents, 0);
  assert.equal(overDiscounted.taxableCents, 0);
});

test("with nothing exempt, the base is the whole discounted cart", () => {
  // The behaviour every existing row keeps: absent tax_exempt means taxable.
  const tax = taxOnCart([{ amountCents: 1000, exempt: false }, { amountCents: 500, exempt: false }], 8.25, 150);
  assert.equal(tax.taxableCents, 1350);
  assert.equal(tax.taxCents, 111);
  assert.equal(tax.exemptCents, 0);
});
