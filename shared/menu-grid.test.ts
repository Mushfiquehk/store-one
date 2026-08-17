import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_CATEGORY, UNCATEGORISED, menuCategories, productsInCategory } from "./menu-grid";

const latte = { name: "Latte", attributes: { tags: ["espresso"] } };
const bun = { name: "Bun", attributes: { tags: ["bakery"] } };
const mystery = { name: "New thing", attributes: { tags: [] } };
const noAttributes = { name: "Older thing", attributes: null };

test("a product with no tags is reachable without searching for it", () => {
  // The defect, directly: an operator adds an item, and it must appear on the till.
  const products = [latte, bun, mystery];
  const categories = menuCategories(products);

  assert.equal(categories[0], ALL_CATEGORY, "the default shows everything");
  assert.ok(categories.includes(UNCATEGORISED), "and there is a home for the untagged item");
  assert.deepEqual(productsInCategory(products, ALL_CATEGORY), products);
  assert.deepEqual(productsInCategory(products, UNCATEGORISED), [mystery]);
});

test("a product with no attributes at all is treated the same way", () => {
  const products = [latte, noAttributes];
  assert.ok(menuCategories(products).includes(UNCATEGORISED));
  assert.deepEqual(productsInCategory(products, UNCATEGORISED), [noAttributes]);
});

test("Uncategorised is not offered when it would be empty", () => {
  // A dead button that filters to nothing is its own small lie about the menu.
  const categories = menuCategories([latte, bun]);
  assert.equal(categories.includes(UNCATEGORISED), false);
  assert.deepEqual(categories, [ALL_CATEGORY, "espresso", "bakery"]);
});

test("tags keep the order they are first seen in, and are not duplicated", () => {
  const categories = menuCategories([bun, latte, { name: "Another bun", attributes: { tags: ["bakery"] } }]);
  assert.deepEqual(categories, [ALL_CATEGORY, "bakery", "espresso"]);
});

test("a category filter still narrows to that category", () => {
  const products = [latte, bun, mystery];
  assert.deepEqual(productsInCategory(products, "espresso"), [latte]);
  assert.deepEqual(productsInCategory(products, "bakery"), [bun]);
  assert.deepEqual(productsInCategory(products, "nonexistent"), [], "an unknown tag shows nothing");
});

test("an empty menu offers only All, and it is empty", () => {
  assert.deepEqual(menuCategories([]), [ALL_CATEGORY]);
  assert.deepEqual(productsInCategory([], ALL_CATEGORY), []);
});
