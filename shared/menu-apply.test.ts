import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandlers, type ApiAdminStorage } from "./api-handlers";

/**
 * An in-memory stand-in for ApiAdminStorage — enough of it to exercise menu/apply.
 * The task's check says "run the server"; the assertion that matters is that a second
 * apply is all noop and creates no rows, which needs a store, not Postgres.
 */
function fakeStore() {
  const rows = {
    products: [] as any[],
    variants: [] as any[],
    modifierGroups: [] as any[],
    modifiers: [] as any[],
    productModifierGroups: [] as any[],
  };

  const create = (table: keyof typeof rows) => async (data: Record<string, unknown>) => {
    const row = { deletedAt: null, updatedAt: Date.now(), ...data };
    rows[table].push(row);
    return row;
  };
  const update = (table: keyof typeof rows) => async (id: string, data: Record<string, unknown>) => {
    const row = rows[table].find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, data);
    return row;
  };

  // The category order is a setting now (Feature 25 T2/T4), so apply reads and writes one.
  const settings = new Map<string, unknown>();

  const store = {
    getSetting: async (k: string) =>
      settings.has(k) ? { key: k, value: settings.get(k), updatedAt: 1 } : null,
    setSetting: async (k: string, value: unknown) => {
      settings.set(k, value);
      return { key: k, value, updatedAt: 1 };
    },
    listProducts: async () => rows.products,
    listVariants: async () => rows.variants,
    listModifierGroups: async () => rows.modifierGroups,
    listModifiers: async () => rows.modifiers,
    listProductModifierGroups: async () => rows.productModifierGroups,
    createProduct: create("products"),
    createVariant: create("variants"),
    createModifierGroup: create("modifierGroups"),
    createModifier: create("modifiers"),
    updateProduct: update("products"),
    updateVariant: update("variants"),
    updateModifierGroup: update("modifierGroups"),
    updateModifier: update("modifiers"),
    // Replaces the whole set, exactly like the real implementations.
    setProductModifierGroups: async (productId: string, groupIds: string[]) => {
      rows.productModifierGroups = rows.productModifierGroups.filter((l) => l.productId !== productId);
      for (const modifierGroupId of groupIds) {
        rows.productModifierGroups.push({ productId, modifierGroupId, deletedAt: null });
      }
    },
  } as unknown as ApiAdminStorage;

  return { store, rows, settings };
}

const twoProducts = {
  modifierGroups: [
    { name: "Milk", minSelections: 1, maxSelections: 1, modifiers: [{ name: "Oat", baseUpcharge: 75 }] },
  ],
  products: [
    { name: "Latte", variants: [{ name: "Small", basePrice: 450 }, { name: "Large", basePrice: 550 }], modifierGroups: ["Milk"] },
    { name: "Drip Coffee", variants: [{ name: "Regular", basePrice: 300 }] },
  ],
};

const apply = (store: ApiAdminStorage, body: unknown) =>
  createApiHandlers(store).handle({ method: "POST", path: "/api/admin/menu/apply", params: {}, body });

/** Success bodies use the documented { data: ... } envelope; errors use { error, details }. */
const payload = (res: { data: unknown }) => (res.data as any).data;
const details = (res: { data: unknown }) => (res.data as any).details;

const counts = (rows: Record<string, unknown[]>) =>
  Object.fromEntries(Object.entries(rows).map(([table, list]) => [table, list.length]));

test("a dry run writes nothing", async () => {
  const { store, rows } = fakeStore();
  const res = await apply(store, { ...twoProducts, dryRun: true });

  assert.equal(res.status, 200);
  assert.equal(payload(res).applied, false);
  assert.ok(payload(res).changes.length > 0);
  assert.deepEqual(counts(rows), {
    products: 0, variants: 0, modifierGroups: 0, modifiers: 0, productModifierGroups: 0,
  });
});

// The task's check: apply twice, second run all noop, row counts unchanged.
test("applying a two-product blueprint twice is idempotent", async () => {
  const { store, rows } = fakeStore();

  const first = await apply(store, twoProducts);
  assert.equal(first.status, 200);
  assert.equal(payload(first).applied, true);
  assert.deepEqual(counts(rows), {
    products: 2, variants: 3, modifierGroups: 1, modifiers: 1, productModifierGroups: 1,
  });
  const afterFirst = counts(rows);

  const second = await apply(store, twoProducts);
  assert.equal(second.status, 200);
  const moved = payload(second).changes.filter((c: any) => c.op !== "noop");
  assert.deepEqual(moved, [], `second apply was not a noop: ${JSON.stringify(moved)}`);
  assert.deepEqual(counts(rows), afterFirst, "second apply changed row counts");
});

test("an edited price updates in place rather than creating a row", async () => {
  const { store, rows } = fakeStore();
  await apply(store, twoProducts);

  const raised = structuredClone(twoProducts);
  raised.products[0].variants[1].basePrice = 600;
  const res = await apply(store, raised);

  assert.equal(payload(res).changes.filter((c: any) => c.op === "update").length, 1);
  assert.equal(rows.variants.length, 3);
  assert.equal(rows.variants.find((v) => v.name === "Large").basePrice, 600);
});

test("created rows are linked to the right parents", async () => {
  const { store, rows } = fakeStore();
  await apply(store, twoProducts);

  const latte = rows.products.find((p) => p.name === "Latte");
  const milk = rows.modifierGroups.find((g) => g.name === "Milk");
  assert.equal(rows.variants.filter((v) => v.productId === latte.id).length, 2);
  assert.equal(rows.modifiers[0].modifierGroupId, milk.id);
  assert.deepEqual(rows.productModifierGroups, [{ productId: latte.id, modifierGroupId: milk.id, deletedAt: null }]);
});

test("an invalid blueprint is rejected with every error and writes nothing", async () => {
  const { store, rows } = fakeStore();
  const res = await apply(store, { products: [{ name: "  ", variants: [{ name: "Small", basePrice: -1 }] }] });

  assert.equal(res.status, 400);
  assert.ok(details(res).length >= 2);
  assert.equal(rows.products.length, 0);
});

test("an unknown modifier group reference is rejected before any write", async () => {
  const { store, rows } = fakeStore();
  const res = await apply(store, { products: [{ name: "Latte", modifierGroups: ["Nitro"] }] });

  assert.equal(res.status, 400);
  assert.match(details(res)[0].message, /unknown modifier group/);
  assert.deepEqual(counts(rows), {
    products: 0, variants: 0, modifierGroups: 0, modifiers: 0, productModifierGroups: 0,
  });
});

test("categories and layout travel with the menu, and re-applying is entirely noop", async () => {
  // The round-trip invariant this task exists to keep: an exported menu, re-applied, must
  // report every change as noop — including the category order and each product's position.
  const { store, settings } = fakeStore();

  const blueprint = {
    categories: ["Drinks", "Bakery"],
    products: [
      { name: "Latte", type: "RESTAURANT", category: "Drinks", sortOrder: 0, variants: [{ name: "Small", basePrice: 425 }] },
      { name: "Bun", type: "RETAIL", category: "Bakery", sortOrder: 1, variants: [{ name: "Each", basePrice: 300 }] },
    ],
  };

  const first = payload(await apply(store, blueprint));
  assert.equal(first.changes[0].entity, "menuCategories", "the order lands before the products that name it");
  assert.equal(first.changes[0].op, "create");
  assert.deepEqual(settings.get("menu.categories"), ["Drinks", "Bakery"]);

  const second = payload(await apply(store, blueprint));
  assert.ok(second.changes.length > 0, "it did look at everything");
  assert.deepEqual(
    second.changes.filter((c: any) => c.op !== "noop"),
    [],
    "re-applying the same menu changes nothing at all",
  );
});

test("reordering categories in a blueprint is an update, not a duplicate list", async () => {
  const { store, settings } = fakeStore();

  await apply(store, { categories: ["Drinks", "Bakery"], products: [] });
  const reordered = payload(await apply(store, { categories: ["Bakery", "Drinks"], products: [] }));

  assert.equal(reordered.changes[0].op, "update");
  assert.deepEqual(settings.get("menu.categories"), ["Bakery", "Drinks"]);
});

test("a blueprint that says nothing about layout moves nothing", async () => {
  // An agent editing a price must not silently reposition the menu.
  const { store, rows, settings } = fakeStore();

  await apply(store, {
    categories: ["Drinks"],
    products: [{ name: "Latte", category: "Drinks", sortOrder: 3, variants: [{ name: "Small", basePrice: 425 }] }],
  });
  assert.equal(rows.products[0].sortOrder, 3);

  const priceOnly = payload(await apply(store, {
    products: [{ name: "Latte", variants: [{ name: "Small", basePrice: 450 }] }],
  }));

  assert.equal(rows.products[0].category, "Drinks", "still in its category");
  assert.equal(rows.products[0].sortOrder, 3, "still in its position");
  assert.deepEqual(settings.get("menu.categories"), ["Drinks"], "and the bar order is untouched");
  assert.equal(priceOnly.changes.some((c: any) => c.entity === "menuCategories"), false, "no category change proposed");
});
