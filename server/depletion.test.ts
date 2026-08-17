import { test } from "node:test";
import assert from "node:assert/strict";
import { getDemoAdminData } from "./seed-data";
import { computeInventoryDeductions } from "../shared/depletion";

// The proof the two copies of the depletion walk were equivalent before one of them was
// deleted: a real seeded drink, rung the way the till rings it, with the deltas written
// out by hand from the seed rows rather than recorded from the code under test.
function seedFixture() {
  const data = getDemoAdminData();
  const byName = <T extends { name: string }>(rows: T[], name: string) => {
    const row = rows.find(r => r.name === name);
    assert.ok(row, `seed data has no ${name}`);
    return row!;
  };

  const mocha = byName(data.products, "Mocha");
  const small = data.variants.find(v => v.productId === mocha.id && v.name === "Small")!;
  // Two modifiers are called "Oat Milk" (a full milk choice and a splash); the milk
  // choice is the 8 oz one, and the one the Mocha's whole-milk row is overridden by.
  const oatMilk = data.modifiers.find(m => m.name === "Oat Milk" && m.quantityPerUse === 8)!;
  const inv = (name: string) => byName(data.inventoryItems, name).id;

  return { data, small, oatMilk, inv };
}

test("a seeded small mocha with oat milk deducts exactly what its recipe says", () => {
  const { data, small, oatMilk, inv } = seedFixture();

  const deltas = computeInventoryDeductions(
    [{ variantId: small.id, qty: 1, modifiers: [{ modifierId: oatMilk.id, qty: 1 }] }],
    data,
  );

  // Written out from the seed rows, one line per BOM entry the walk should touch:
  //   mocha_esp   → sub-recipe: one espresso shot at scale 1 → 0.5 oz beans
  //   mocha_sauce → 2 pumps at scale 1
  //   mocha_milk  → SKIPPED: overridden by the milk group, and a milk choice was made
  //   mocha_whip  → 1 unit at scale 1
  //   oat milk    → no MODIFIER bom row, so the modifier's own quantityPerUse: 8 oz
  assert.deepEqual(Object.fromEntries(deltas), {
    [inv("Espresso Beans")]: -0.5,
    [inv("Mocha Sauce")]: -2,
    [inv("Whipped Cream")]: -1,
    [inv("Oat Milk")]: -8,
  });
  assert.ok(!deltas.has(inv("Whole Milk")), "the overridden milk row must not fire");
});

test("quantity multiplies every line, including the sub-recipe", () => {
  const { data, small, oatMilk, inv } = seedFixture();
  const deltas = computeInventoryDeductions(
    [{ variantId: small.id, qty: 3, modifiers: [{ modifierId: oatMilk.id, qty: 1 }] }],
    data,
  );
  assert.equal(deltas.get(inv("Espresso Beans")), -1.5);
  assert.equal(deltas.get(inv("Oat Milk")), -24);
});

test("a BOM row pointing at nothing deducts from nothing", () => {
  // The server copy had a bare `else` here and booked a phantom deduction under the
  // empty-string key; the till's copy guarded on inventoryItemId. The guard wins.
  const deltas = computeInventoryDeductions(
    [{ variantId: "v1", qty: 1 }],
    {
      products: [{ id: "p_sub" }],
      variants: [
        { id: "v1", name: "Small", productId: "p1", directInventoryId: null },
        { id: "v_sub", name: "Default", productId: "p_sub", directInventoryId: null },
      ],
      modifiers: [],
      bomEntries: [
        { sourceType: "VARIANT", sourceId: "v1", inventoryItemId: "", sourceProductId: "p_sub", quantityDeducted: 1, scaleFactorMatrix: null, overrideModifierGroupId: null },
        { sourceType: "VARIANT", sourceId: "v_sub", inventoryItemId: "", sourceProductId: null, quantityDeducted: 2, scaleFactorMatrix: null, overrideModifierGroupId: null },
      ],
    },
  );
  assert.deepEqual(Object.fromEntries(deltas), {});
});

test("a variant with no recipe falls back to its direct inventory item", () => {
  const deltas = computeInventoryDeductions(
    [{ variantId: "v1", qty: 2 }],
    {
      products: [],
      variants: [{ id: "v1", name: "Bottle", productId: "p1", directInventoryId: "inv_cola" }],
      modifiers: [],
      bomEntries: [],
    },
  );
  assert.deepEqual(Object.fromEntries(deltas), { inv_cola: -2 });
});
