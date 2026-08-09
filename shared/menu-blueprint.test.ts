import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMenuBlueprint, planMenuApply, type ExistingMenu, type MenuBlueprint } from "./menu-blueprint";

const goodBlueprint = {
  dryRun: true,
  modifierGroups: [
    {
      name: "Milk",
      minSelections: 1,
      maxSelections: 1,
      modifiers: [
        { name: "Whole", baseUpcharge: 0 },
        { name: "Oat", baseUpcharge: 75 },
      ],
    },
  ],
  products: [
    {
      name: "Latte",
      type: "RESTAURANT",
      variants: [
        { name: "Small", basePrice: 450 },
        { name: "Large", basePrice: 550 },
      ],
      modifierGroups: ["Milk"],
    },
  ],
};

test("a good blueprint parses", () => {
  const result = parseMenuBlueprint(goodBlueprint);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.blueprint.products[0].variants[1].basePrice, 550);
  assert.equal(result.blueprint.modifierGroups[0].modifiers[0].baseUpcharge, 0);
});

test("optional fields default rather than failing", () => {
  const result = parseMenuBlueprint({ products: [{ name: "Drip Coffee" }] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.blueprint.dryRun, false);
  assert.equal(result.blueprint.products[0].type, "RESTAURANT");
  assert.deepEqual(result.blueprint.products[0].variants, []);
});

// The point of the check: an agent gets ALL its mistakes back in one round trip.
test("a bad blueprint reports every error, not just the first", () => {
  const result = parseMenuBlueprint({
    products: [
      { name: "   ", variants: [{ name: "Small", basePrice: -1 }] },
      { name: "Latte", variants: [{ name: "Large", basePrice: 4.5 }] },
    ],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  const paths = result.errors.map((e) => e.path);
  assert.ok(paths.includes("products.0.name"), `missing blank-name error: ${paths}`);
  assert.ok(paths.includes("products.0.variants.0.basePrice"), `missing negative-price error: ${paths}`);
  assert.ok(paths.includes("products.1.variants.0.basePrice"), `missing non-integer-price error: ${paths}`);
});

test("minSelections may not exceed maxSelections", () => {
  const result = parseMenuBlueprint({
    modifierGroups: [{ name: "Milk", minSelections: 2, maxSelections: 1 }],
  });
  assert.equal(result.ok, false);
});

test("duplicate names are rejected — name matching could not resolve them", () => {
  const result = parseMenuBlueprint({
    products: [{ name: "Latte" }, { name: " latte " }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors[0].message, /duplicate product name/);
});

/* ---------------------------- T2: the diff planner ---------------------------- */

const EMPTY: ExistingMenu = {
  products: [],
  variants: [],
  modifierGroups: [],
  modifiers: [],
  productModifierGroups: [],
};

function parsed(input: unknown): MenuBlueprint {
  const result = parseMenuBlueprint(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("blueprint did not parse");
  return result.blueprint;
}

/** The system state that applying `goodBlueprint` to an empty system would produce. */
const appliedMenu: ExistingMenu = {
  products: [{ id: "p1", name: "Latte", type: "RESTAURANT", deletedAt: null } as any],
  variants: [
    { id: "v1", productId: "p1", name: "Small", basePrice: 450, sku: null, deletedAt: null } as any,
    { id: "v2", productId: "p1", name: "Large", basePrice: 550, sku: null, deletedAt: null } as any,
  ],
  modifierGroups: [{ id: "g1", name: "Milk", minSelections: 1, maxSelections: 1, deletedAt: null } as any],
  modifiers: [
    { id: "m1", modifierGroupId: "g1", name: "Whole", baseUpcharge: 0, deletedAt: null } as any,
    { id: "m2", modifierGroupId: "g1", name: "Oat", baseUpcharge: 75, deletedAt: null } as any,
  ],
  productModifierGroups: [{ productId: "p1", modifierGroupId: "g1", deletedAt: null } as any],
};

test("an empty system creates everything", () => {
  const { changes, errors } = planMenuApply(parsed(goodBlueprint), EMPTY);
  assert.deepEqual(errors, []);
  assert.ok(
    changes.every((c) => c.op === "create"),
    JSON.stringify(changes.filter((c) => c.op !== "create")),
  );
  assert.equal(changes.filter((c) => c.entity === "modifierGroup").length, 1);
  assert.equal(changes.filter((c) => c.entity === "modifier").length, 2);
  assert.equal(changes.filter((c) => c.entity === "variant").length, 2);
  assert.equal(changes.find((c) => c.entity === "productModifierGroups")?.groupNames?.length, 1);
});

// The invariant the whole feature rests on: apply is idempotent.
test("an identical re-apply is all noop", () => {
  const { changes, errors } = planMenuApply(parsed(goodBlueprint), appliedMenu);
  assert.deepEqual(errors, []);
  const moved = changes.filter((c) => c.op !== "noop");
  assert.deepEqual(moved, [], `expected no changes, got ${JSON.stringify(moved)}`);
});

test("a changed price produces exactly one update with the right from/to", () => {
  const cheaper = structuredClone(goodBlueprint);
  cheaper.products[0].variants[1].basePrice = 500;

  const { changes } = planMenuApply(parsed(cheaper), appliedMenu);
  const updates = changes.filter((c) => c.op === "update");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].entity, "variant");
  assert.equal(updates[0].name, "Large");
  assert.equal(updates[0].parent, "Latte");
  assert.deepEqual(updates[0].fields, { basePrice: { from: 550, to: 500 } });
});

test("matching is case-insensitive and trimmed", () => {
  const restyled = structuredClone(goodBlueprint);
  restyled.products[0].name = "  latte  ";
  const { changes } = planMenuApply(parsed(restyled), appliedMenu);
  assert.equal(changes.find((c) => c.entity === "product")?.op, "noop");
});

test("soft-deleted rows are invisible, so a new row is created", () => {
  const withDeleted: ExistingMenu = {
    ...appliedMenu,
    products: [{ ...(appliedMenu.products[0] as any), deletedAt: 1700000000000 }],
  };
  const { changes } = planMenuApply(parsed(goodBlueprint), withDeleted);
  assert.equal(changes.find((c) => c.entity === "product")?.op, "create");
});

// Upsert, never delete — a blueprint that omits a group must not unlink it.
test("existing group links survive a blueprint that does not mention them", () => {
  const withExtraGroup: ExistingMenu = {
    ...appliedMenu,
    modifierGroups: [
      ...appliedMenu.modifierGroups,
      { id: "g2", name: "Syrup", minSelections: 0, maxSelections: 3, deletedAt: null } as any,
    ],
    productModifierGroups: [
      ...appliedMenu.productModifierGroups,
      { productId: "p1", modifierGroupId: "g2", deletedAt: null } as any,
    ],
  };
  const { changes } = planMenuApply(parsed(goodBlueprint), withExtraGroup);
  const link = changes.find((c) => c.entity === "productModifierGroups");
  assert.equal(link?.op, "noop");
  assert.deepEqual(link?.groupNames?.slice().sort(), ["Milk", "Syrup"]);
});

test("a reference to a group that exists only in the system is fine", () => {
  const { errors } = planMenuApply(
    parsed({ products: [{ name: "Latte", modifierGroups: ["Milk"] }] }),
    appliedMenu,
  );
  assert.deepEqual(errors, []);
});

test("a reference to a group that exists nowhere is an error", () => {
  const { changes, errors } = planMenuApply(
    parsed({ products: [{ name: "Latte", modifierGroups: ["Nitro"] }] }),
    EMPTY,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unknown modifier group "Nitro"/);
  assert.equal(errors[0].path, "products.0.modifierGroups");
  assert.equal(
    changes.some((c) => c.entity === "productModifierGroups"),
    false,
  );
});
