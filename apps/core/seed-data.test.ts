import { test } from "node:test";
import assert from "node:assert/strict";
import { getDemoAdminData } from "./seed-data";

// A plausibility scan over the demo catalogue, not a costing engine. It sums each
// variant's own BOM lines at the seeded per-stocking-unit prices — enough to catch the
// class of bug this feature exists for, where a per-case price is read as a per-ounce
// one and a $2.75 cookie appears to cost $6.00 of flour.
//
// ponytail: deliberately does not walk composite products or modifiers. When Feature 10
// lands costVariant() on the real deduction map, this should call that instead.
function ingredientCosts() {
  const data = getDemoAdminData();
  const priceOf = new Map(data.inventoryItems.map(i => [i.id, i.lastPurchasePrice]));
  const costs = new Map<string, { cents: number; unpriced: string[] }>(
    data.variants.map(v => [v.id, { cents: 0, unpriced: [] as string[] }]),
  );

  for (const bom of data.bomEntries) {
    if (bom.sourceType !== "VARIANT") continue;
    // A row is shared across sizes through its scale matrix; with no matrix it applies
    // only to the variant it names.
    const matrix = bom.scaleFactorMatrix as Record<string, number> | null;
    const applies = matrix ? Object.entries(matrix) : [[bom.sourceId as string, 1] as [string, number]];
    for (const [variantId, scale] of applies) {
      const entry = costs.get(variantId);
      if (!entry) continue;
      const price = priceOf.get(bom.inventoryItemId);
      if (price == null) {
        entry.unpriced.push(bom.inventoryItemId);
        continue;
      }
      entry.cents += bom.quantityDeducted * (scale as number) * price;
    }
  }
  return { data, costs };
}

test("no seeded variant costs more in ingredients than it sells for", () => {
  const { data, costs } = ingredientCosts();
  const upsideDown = data.variants
    .filter(v => {
      const c = costs.get(v.id)!;
      return c.cents > 0 && c.cents > v.basePrice;
    })
    .map(v => `${v.id}: costs ${costs.get(v.id)!.cents.toFixed(1)}c, sells for ${v.basePrice}c`);
  assert.deepEqual(upsideDown, [], `demo items priced below their ingredient cost:\n${upsideDown.join("\n")}`);
});

test("the demo latte's milk is cents an ounce, not dollars", () => {
  const { data } = ingredientCosts();
  const milk = data.inventoryItems.find(i => i.id.endsWith("inv_whole_milk"))!;
  assert.equal(milk.unitOfMeasure, "oz");
  assert.ok(milk.lastPurchasePrice! < 10, `milk at ${milk.lastPurchasePrice}c/oz is a purchase-unit price in a stocking-unit field`);
  assert.equal(milk.unitsPerPurchase, 128);
});

test("food cost stays in a range an operator would recognise", () => {
  const { data, costs } = ingredientCosts();
  for (const v of data.variants) {
    const c = costs.get(v.id)!;
    if (c.cents === 0 || v.basePrice === 0) continue;
    const pct = (c.cents / v.basePrice) * 100;
    assert.ok(pct < 60, `${v.id} runs a ${pct.toFixed(0)}% food cost — check its conversion factor`);
  }
});

test("an item that was never invoiced has an unknown cost, not a free one", () => {
  const { data } = ingredientCosts();
  const ice = data.inventoryItems.find(i => i.id.endsWith("inv_ice"))!;
  assert.equal(ice.lastPurchasePrice, null);
});
