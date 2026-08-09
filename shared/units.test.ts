import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerStockUnit, hasConversionFactor } from "./units";

test("one gallon at $4.50 into an item stocked in oz costs ~3.5c per oz", () => {
  assert.ok(Math.abs(costPerStockUnit(450, 128) - 3.515625) < 1e-9);
});

test("a missing, zero, negative or infinite factor passes the price through unconverted", () => {
  for (const factor of [null, undefined, 0, -128, Infinity, NaN]) {
    assert.equal(costPerStockUnit(450, factor as number), 450);
  }
});

test("a factor of 1 changes nothing", () => {
  assert.equal(costPerStockUnit(450, 1), 450);
});

test("hasConversionFactor only counts a real pack size", () => {
  assert.equal(hasConversionFactor(128), true);
  assert.equal(hasConversionFactor(1), false);
  assert.equal(hasConversionFactor(null), false);
});
