import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_CATEGORY, UNCATEGORISED, categoryOf, menuCategories, productsInCategory, renameCategory } from "./menu-grid";

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

test("the bar follows the operator's order, not the order products came back in", () => {
  const products = [
    { id: "p1", name: "Bun", category: "Bakery" },
    { id: "p2", name: "Latte", category: "Drinks" },
  ];
  // Products arrive bakery-first; the operator wants Drinks first.
  assert.deepEqual(menuCategories(products, ["Drinks", "Bakery"]), [ALL_CATEGORY, "Drinks", "Bakery"]);
  assert.deepEqual(menuCategories(products, ["Bakery", "Drinks"]), [ALL_CATEGORY, "Bakery", "Drinks"]);
});

test("a configured category with no products still shows", () => {
  // It is where things should go. Hiding it hides that.
  const categories = menuCategories([{ id: "p1", name: "Latte", category: "Drinks" }], ["Drinks", "Food"]);
  assert.deepEqual(categories, [ALL_CATEGORY, "Drinks", "Food"]);
  assert.deepEqual(productsInCategory([{ id: "p1", name: "Latte", category: "Drinks" }], "Food"), []);
});

test("a product whose category is not in the list is still reachable", () => {
  const products = [{ id: "p1", name: "Latte", category: "Drinks" }, { id: "p2", name: "Soup", category: "Deli" }];
  const categories = menuCategories(products, ["Drinks"]);
  assert.ok(categories.includes("Deli"), "appended rather than hidden");
  assert.deepEqual(productsInCategory(products, "Deli").map(p => p.id), ["p2"]);
});

test("a product's own category wins over its tags, and tags remain the fallback", () => {
  assert.equal(categoryOf({ category: "Drinks", attributes: { tags: ["espresso"] } }), "Drinks");
  assert.equal(categoryOf({ attributes: { tags: ["espresso", "hot"] } }), "espresso", "pre-migration row");
  assert.equal(categoryOf({ category: "", attributes: { tags: ["espresso"] } }), "espresso", "blank is not a category");
  assert.equal(categoryOf({ category: null, attributes: null }), null);
});

test("renaming a category takes its products with it", () => {
  // The failure this prevents: rename the setting, forget the products, and every item in the
  // category becomes uncategorised while the renamed category sits there empty.
  const products = [
    { id: "p1", name: "Latte", category: "Drinks" },
    { id: "p2", name: "Bun", category: "Bakery" },
    { id: "p3", name: "Tea", category: "Drinks" },
  ];
  const { categories, productIds } = renameCategory(["Drinks", "Bakery"], products, "Drinks", "Beverages");

  assert.deepEqual(categories, ["Beverages", "Bakery"], "in place, so the order is kept");
  assert.deepEqual(productIds, ["p1", "p3"], "and these have to be rewritten");

  // Applying it leaves nobody uncategorised.
  const renamed = products.map(p => (productIds.includes(p.id) ? { ...p, category: "Beverages" } : p));
  assert.deepEqual(productsInCategory(renamed, "Beverages").map(p => p.id), ["p1", "p3"]);
  assert.equal(menuCategories(renamed, categories).includes(UNCATEGORISED), false);
});

test("renaming to a blank or unchanged name does nothing", () => {
  const products = [{ id: "p1", name: "Latte", category: "Drinks" }];
  assert.deepEqual(renameCategory(["Drinks"], products, "Drinks", "  ").productIds, []);
  assert.deepEqual(renameCategory(["Drinks"], products, "Drinks", "Drinks").categories, ["Drinks"]);
});
