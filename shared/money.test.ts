import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDollarsInput, parseDollarsToCents } from "./money";

test("dollars typed by an operator become cents", () => {
  assert.equal(parseDollarsToCents("18.50"), 1850);
  assert.equal(parseDollarsToCents("18"), 1800);
  assert.equal(parseDollarsToCents("$1,250.75"), 125075);
  assert.equal(parseDollarsToCents("0"), 0, "an explicit zero is a real answer");
});

test("a blank or nonsense amount is null, never zero", () => {
  // Number("") is 0, which is how a wage nobody set becomes a wage of $0.00 that looks
  // deliberate. The whole point of this function is that "" is not an amount.
  for (const bad of ["", "   ", "abc", "-5", "1.2.3"]) {
    assert.equal(parseDollarsToCents(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("fractions of a cent round rather than truncate", () => {
  assert.equal(parseDollarsToCents("18.505"), 1851);
  assert.equal(parseDollarsToCents("0.004"), 0);
});

test("cents round-trip back into the field they were typed in", () => {
  assert.equal(centsToDollarsInput(1850), "18.50");
  assert.equal(centsToDollarsInput(0), "0.00");
  assert.equal(centsToDollarsInput(null), "", "an unset amount shows an empty box, not 0.00");
  assert.equal(parseDollarsToCents(centsToDollarsInput(2200)), 2200);
});
