import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerStockUnit, stockUnitsReceived } from "./units";

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

test("receiving 2 gallons puts 256 oz on hand, and the two halves agree", () => {
  assert.equal(stockUnitsReceived(2, 128), 256);
  // Price per stocking unit times stocking units received is what the delivery cost.
  assert.ok(Math.abs(costPerStockUnit(450, 128) * stockUnitsReceived(2, 128) - 900) < 1e-9);
});

test("an unset factor receives the quantity as typed", () => {
  for (const factor of [null, undefined, 0, -1]) {
    assert.equal(stockUnitsReceived(3, factor as number), 3);
  }
});
