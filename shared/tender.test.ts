import { test } from "node:test";
import assert from "node:assert/strict";
import { changeDueCents, tenderSuggestions } from "./schema";

test("$20.00 against a $13.75 total is $6.25 change", () => {
  assert.equal(changeDueCents(1375, 2000), 625);
});

test("an under-tender is zero change, never a negative", () => {
  // The confirm is blocked at this point; the number behind it must still be sane,
  // because a negative change is money handed *to* the customer by arithmetic.
  assert.equal(changeDueCents(1375, 1000), 0);
  assert.equal(changeDueCents(1375, 0), 0);
});

test("exact tender is zero change", () => {
  assert.equal(changeDueCents(1375, 1375), 0);
});

test("quick amounts start at the exact total and never ask for less", () => {
  const s = tenderSuggestions(1375);
  assert.equal(s[0], 1375, "the exact total is always offered first");
  assert.deepEqual(s, [1375, 1500, 2000, 5000]);
  assert.ok(s.every(v => v >= 1375), "no button may under-tender");
});

test("a total that is already a round note is not offered twice", () => {
  const s = tenderSuggestions(2000);
  assert.deepEqual(s, [2000, 5000]);
  assert.equal(new Set(s).size, s.length);
});
