import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerRows } from "./ledger";

const ctx = (over: Partial<Parameters<typeof ledgerRows>[2]> = {}) => ({
  reason: "SALE" as const,
  refType: "SALE",
  refId: "sale_1",
  createdAt: 1000,
  newId: (id: string) => `led_${id}`,
  ...over,
});

test("one row per distinct inventory item, each carrying the resulting quantity", () => {
  const { rows, quantityAfter } = ledgerRows(
    new Map([["milk", -8], ["beans", -0.5]]),
    { milk: 100, beans: 2 },
    ctx(),
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(quantityAfter, { milk: 92, beans: 1.5 });
  assert.deepEqual(rows[0], {
    id: "led_milk",
    inventoryItemId: "milk",
    delta: -8,
    quantityAfter: 92,
    reason: "SALE",
    refType: "SALE",
    refId: "sale_1",
    note: "",
    employeeId: null,
    createdAt: 1000,
    updatedAt: 1000,
  });
});

test("an item the caller knows nothing about is skipped, not invented", () => {
  // A ledger row about an item that does not exist explains nothing, and writing a
  // quantity for it would create stock out of thin air.
  const { rows, quantityAfter } = ledgerRows(new Map([["ghost", -5]]), {}, ctx());
  assert.deepEqual(rows, []);
  assert.deepEqual(quantityAfter, {});
});

test("a receive is a positive delta through the same path", () => {
  const { rows, quantityAfter } = ledgerRows(
    { milk: 128 },
    { milk: 12 },
    ctx({ reason: "RECEIVE", refType: "INVOICE", refId: "inv_9" }),
  );
  assert.equal(quantityAfter.milk, 140);
  assert.equal(rows[0].reason, "RECEIVE");
  assert.equal(rows[0].refId, "inv_9");
});

test("the ledger records the delta that was asked for, even where the quantity clamps", () => {
  // Selling ten lattes against four ounces of milk leaves the column at 0 — but the row
  // still says -36, which is the only place the over-draw survives today. Feature 15 T3
  // takes the clamp off; until then this is what keeps the signal.
  const { rows, quantityAfter } = ledgerRows(new Map([["milk", -36]]), { milk: 4 }, ctx());
  assert.equal(quantityAfter.milk, 0);
  assert.equal(rows[0].delta, -36);
  assert.equal(rows[0].quantityAfter, 0);
});
