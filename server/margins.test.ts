import { test } from "node:test";
import assert from "node:assert/strict";
import { getDemoAdminData } from "./seed-data";
import { menuMargins, type MarginData } from "../shared/pricing";

function seedMarginData(unpricedItemName?: string): MarginData {
  const data = getDemoAdminData();
  return {
    products: data.products,
    variants: data.variants,
    modifiers: data.modifiers,
    bomEntries: data.bomEntries,
    inventoryItems: data.inventoryItems.map(i =>
      i.name === unpricedItemName ? { ...i, lastPurchasePrice: null } : i,
    ),
  };
}

test("the seeded menu costs out, and nothing unpriced leads the report", () => {
  const rows = menuMargins(seedMarginData("Whole Milk"));

  const withKnownCost = rows.filter(r => r.costKnown);
  assert.ok(withKnownCost.length > 0, "the demo catalogue must produce some real margins");

  // Every row that depends on the unpriced item says so, by name, and none of them is
  // presented as profitable — the check this task exists for.
  const unknown = rows.filter(r => !r.costKnown);
  const milkRows = unknown.filter(r => r.unknownIngredients.includes("Whole Milk"));
  assert.ok(milkRows.length > 0, "the drinks that use milk must be flagged");
  assert.ok(milkRows.every(r => r.marginPct === null && r.contributionCents === 0));

  // Unknown-cost rows sort after every known one, so the top of the report is real.
  const firstUnknown = rows.findIndex(r => !r.costKnown);
  assert.ok(rows.slice(0, firstUnknown).every(r => r.costKnown));
  assert.equal(rows[0].costKnown, true);
  assert.notEqual(rows[0].marginPct, null);
});

test("a variant with no recipe rows in the seed is unknown, not the best item on the menu", () => {
  // The seed attaches BOM rows to each drink's small variant only, so mediums and larges
  // have no recipe. Costing those at zero would rank them as the most profitable items.
  const rows = menuMargins(seedMarginData());
  const large = rows.find(r => r.variantName === "Large" && r.productName === "Latte");
  assert.ok(large, "the seed has a large latte");
  assert.equal(large!.costKnown, false, "no recipe means unknown cost");
  assert.notEqual(rows[0].variantName, "Large");
});
