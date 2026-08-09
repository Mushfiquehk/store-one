import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMenuBlueprint } from "./menu-blueprint";

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
