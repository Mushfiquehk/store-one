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

test("an over-draw goes negative rather than clamping to zero", () => {
  // Selling ten lattes against four ounces of milk means the recipe used 36 more than was
  // on hand. The old clamp wrote 0 and deleted the question; -32 is the answer to it.
  const { rows, quantityAfter } = ledgerRows(new Map([["milk", -36]]), { milk: 4 }, ctx());
  assert.equal(quantityAfter.milk, -32);
  assert.equal(rows[0].delta, -36);
  assert.equal(rows[0].quantityAfter, -32, "the row must match the column, negative and all");
});

test("stock already negative keeps going, and receiving digs it back out", () => {
  const down = ledgerRows(new Map([["milk", -8]]), { milk: -32 }, ctx());
  assert.equal(down.quantityAfter.milk, -40);

  const up = ledgerRows({ milk: 128 }, { milk: -40 }, ctx({ reason: "RECEIVE" }));
  assert.equal(up.quantityAfter.milk, 88, "a receive nets against the shortfall, not against zero");
});
