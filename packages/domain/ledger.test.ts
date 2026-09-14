import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerRows, reconcile, WASTE_REASONS, type InventoryLedgerEntry } from "./ledger";

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


const row = (over: Partial<InventoryLedgerEntry>): InventoryLedgerEntry => ({
  id: "r", inventoryItemId: "milk", delta: 0, quantityAfter: 0, reason: "SALE",
  refType: null, refId: null, note: "", employeeId: null, createdAt: 0, updatedAt: 0,
  ...over,
});

test("received 100, sold 40, wasted 5, counted at 50 is an unexplained 5", () => {
  // The plan's check, exactly: not 0, and not an error. Five ounces left the building
  // without a sale, a delivery or a waste row to explain them.
  const [r] = reconcile([
    row({ reason: "RECEIVE", delta: 100, quantityAfter: 100, createdAt: 1 }),
    row({ reason: "SALE", delta: -40, quantityAfter: 60, createdAt: 2 }),
    row({ reason: "WASTE", delta: -5, quantityAfter: 55, createdAt: 3 }),
    row({ reason: "COUNT", delta: -5, quantityAfter: 50, createdAt: 4 }),
  ]);

  assert.deepEqual(r, {
    inventoryItemId: "milk",
    opening: 0,
    received: 100,
    sold: 40,
    wasted: 5,
    manual: 0,
    counted: 50,
    closing: 50,
    unexplained: 5,
  });
});

test("nobody counted, so nothing is unexplained — honestly zero", () => {
  const [r] = reconcile([
    row({ reason: "RECEIVE", delta: 100, quantityAfter: 100, createdAt: 1 }),
    row({ reason: "SALE", delta: -40, quantityAfter: 60, createdAt: 2 }),
  ]);
  assert.equal(r.counted, null);
  assert.equal(r.unexplained, 0);
  assert.equal(r.closing, 60);
});

test("a count that finds more than expected is a negative variance, not an error", () => {
  const [r] = reconcile([
    row({ reason: "SALE", delta: -10, quantityAfter: 40, createdAt: 1 }),
    row({ reason: "COUNT", delta: 3, quantityAfter: 43, createdAt: 2 }),
  ]);
  assert.equal(r.opening, 50);
  assert.equal(r.unexplained, -3, "found more than the books said");
});

test("items are reconciled independently, in whatever order the rows arrive", () => {
  const rows = reconcile([
    row({ inventoryItemId: "beans", reason: "SALE", delta: -2, quantityAfter: 8, createdAt: 5 }),
    row({ reason: "SALE", delta: -1, quantityAfter: 9, createdAt: 9 }),
    row({ reason: "RECEIVE", delta: 10, quantityAfter: 10, createdAt: 2 }),
  ]);
  const byId = Object.fromEntries(rows.map(r => [r.inventoryItemId, r]));
  assert.equal(byId.milk.opening, 0, "the earliest row is the opening, not the first supplied");
  assert.equal(byId.milk.closing, 9);
  assert.equal(byId.beans.sold, 2);
});

test("every waste reason is a real choice, not a free-text box", () => {
  assert.ok(WASTE_REASONS.length >= 4);
  assert.ok(WASTE_REASONS.every(r => r.trim().length > 0));
});
