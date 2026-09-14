import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalisedPurchaseUnit,
  normalisedSaleLines,
  normalisedUnitsPerPurchase,
} from "./migrations";

test("a missing purchase factor becomes 1 — bought and stocked the same way", () => {
  assert.equal(normalisedUnitsPerPurchase(undefined), 1);
  assert.equal(normalisedUnitsPerPurchase(null), 1);
  // A real factor is left exactly alone, including a fractional one.
  assert.equal(normalisedUnitsPerPurchase(128), 128);
  assert.equal(normalisedUnitsPerPurchase(2.5), 2.5);
});

test("a factor that cannot be true is treated as absent, not obeyed", () => {
  // A case containing zero units is a form submitted empty, not a fact.
  assert.equal(normalisedUnitsPerPurchase(0), 1);
  assert.equal(normalisedUnitsPerPurchase(-4), 1);
  assert.equal(normalisedUnitsPerPurchase(Number.NaN), 1);
  assert.equal(normalisedUnitsPerPurchase(Number.POSITIVE_INFINITY), 1);
  // A number that arrived as a string is not a number.
  assert.equal(normalisedUnitsPerPurchase("128"), 1);
});

test("an unknown purchase unit is null, never an empty string", () => {
  assert.equal(normalisedPurchaseUnit(undefined), null);
  assert.equal(normalisedPurchaseUnit(null), null);
  assert.equal(normalisedPurchaseUnit(""), null);
  assert.equal(normalisedPurchaseUnit("   "), null);
  assert.equal(normalisedPurchaseUnit("case"), "case");
  assert.equal(normalisedPurchaseUnit("  bag  "), "bag");
  assert.equal(normalisedPurchaseUnit(7), null);
});

test("sale lines survive being stored as a JSON string", () => {
  const lines = [{ variantId: "v1", qty: 2 }];
  assert.deepEqual(normalisedSaleLines(lines), lines);
  assert.deepEqual(normalisedSaleLines(JSON.stringify(lines)), lines);
  assert.deepEqual(normalisedSaleLines("[]"), []);
});

test("lines that cannot be read become empty rather than nonsense", () => {
  // The sale's totals are its own columns, so the money still adds up.
  assert.deepEqual(normalisedSaleLines("{not json"), []);
  assert.deepEqual(normalisedSaleLines('{"variantId":"v1"}'), [], "an object is not a line list");
  assert.deepEqual(normalisedSaleLines("null"), []);
  assert.deepEqual(normalisedSaleLines(undefined), []);
  assert.deepEqual(normalisedSaleLines(null), []);
  assert.deepEqual(normalisedSaleLines(42), []);
});

test("normalising twice changes nothing the second time", () => {
  // The upgrade may run against rows a previous upgrade already touched.
  for (const v of [undefined, 0, 128, -1]) {
    const once = normalisedUnitsPerPurchase(v);
    assert.equal(normalisedUnitsPerPurchase(once), once);
  }
  for (const v of [undefined, "", "case"]) {
    const once = normalisedPurchaseUnit(v);
    assert.equal(normalisedPurchaseUnit(once), once);
  }
  for (const v of ["[]", "{bad", [{ variantId: "v1" }]]) {
    const once = normalisedSaleLines(v);
    assert.deepEqual(normalisedSaleLines(once), once);
  }
});
